import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BillingSnapshot } from "./billing-store";
import { reconcileIntents, canonical, preserveConflicts, type Intent, type IntentQueue } from "./sync-intent";
import { toast } from "sonner";
import { intentPersistence } from './intent-persistence';
import {
  applyRecords,
  clearSyncedLists,
  recordKey,
  type SyncRecord,
} from "./sync-records";

/**
 * Sesi login sudah tidak sah di pusat (kedaluwarsa atau dicabut). Tanpa token
 * yang sah, permintaan berjalan sebagai anon sehingga Postgres menolak
 * store_members dengan "permission denied" — bukan kegagalan jaringan.
 */
function isSessionInvalid(err: unknown): boolean {
  const e = err as { message?: string; code?: string; status?: number } | null;
  if (!e) return false;
  const msg = String(e.message ?? "").toLowerCase();
  return (
    e.code === "42501" ||
    e.status === 401 ||
    e.status === 403 ||
    msg.includes("session_not_found") ||
    msg.includes("session not found") ||
    msg.includes("permission denied") ||
    msg.includes("jwt expired") ||
    msg.includes("invalid claim") ||
    msg.includes("refresh token")
  );
}

/**
 * Coba segarkan sesi sekali. Kalau tetap gagal (dan perangkat sedang daring),
 * bersihkan sesi lokal lalu antar pengguna ke halaman masuk, bukan mengulang
 * permintaan yang pasti ditolak setiap 8 detik.
 */
async function recoverSession(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  const { data } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
  if (data?.session) return true;
  await supabase.auth.signOut({ scope: "local" }).catch(() => null);
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
    window.location.assign("/auth");
  }
  return false;
}


const LEGACY_OUTBOX_KEY = "billing-sync-outbox-v1";
const SHADOW_KEY = "billing-sync-shadow-v1";
const SINCE_KEY = "billing-sync-since-v1";
const STORE_KEY = "billing-sync-store-v1";
const FRESH_KEY = "billing-sync-fresh-v1";
// Naikkan versi ini bila cara pengambilan data pusat berubah. Perangkat yang
// pernah menyimpan cursor dari versi lama wajib mengambil baseline lengkap
// sekali lagi; cursor lama tidak dapat menemukan baris yang dulu terlewat.
const BASELINE_KEY = "billing-sync-baseline-v1";
const BASELINE_VERSION = "explicit-intent-v2";


const EPOCH = "1970-01-01T00:00:00Z";

type RemoteRow = {
  kind: string;
  entity_id: string;
  payload: Record<string, unknown>;
  deleted: boolean;
  updated_at: string;
};

/**
 * Ambil SEMUA baris store per halaman. Pusat hanya mengembalikan maksimal
 * 1000 baris per permintaan; tanpa ini store dengan data banyak kehilangan
 * sebagian unit TV/menu dan tampilannya berubah-ubah.
 *
 * Pada pengambilan pertama (`since` kosong) baris bertanda terhapus TIDAK
 * diambil: isinya kosong dan hanya berguna untuk memberi tahu perangkat yang
 * sudah punya datanya. Tanpa penyaringan ini, store yang sudah lama berjalan
 * harus mengunduh puluhan ribu baris kosong dulu sebelum layar terisi,
 * sehingga aplikasi terasa lambat dan sempat menampilkan data lama.
 */
// Jenis data bervolume besar diunduh bersamaan di jalurnya sendiri, sehingga
// baseline tidak menunggu belasan halaman satu per satu.
const HEAVY_KINDS = ["history", "log_entry", "cash_entry"] as const;

async function fetchAllStoreData(
  storeId: string,
  since: string | null,
  skipDeleted = false,
): Promise<{ data: RemoteRow[]; error: { message: string } | null }> {
  const PAGE = 1000;
  const fetchLane = async (
    lane: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>,
  ) => {
    const all: RemoteRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await lane(baseQuery())
        .order("updated_at", { ascending: true })
        .order("kind", { ascending: true })
        .order("entity_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return { data: all, error };
      const rows = (data ?? []) as RemoteRow[];
      all.push(...rows);
      if (rows.length < PAGE) break;
    }
    return { data: all, error: null };
  };
  function baseQuery() {
    let q = supabase
      .from("store_data")
      .select("kind, entity_id, payload, deleted, updated_at")
      .eq("store_id", storeId);
    if (since) q = q.gte("updated_at", since);
    // Baseline penuh mengganti seluruh daftar lokal, jadi baris terhapus
    // (isinya kosong) tidak perlu diunduh.
    else if (skipDeleted) q = q.eq("deleted", false);
    return q;
  }

  // Tarikan inkremental biasanya kecil: satu jalur cukup.
  if (since) return fetchLane((q) => q);

  const lanes = await Promise.all([
    ...HEAVY_KINDS.map((kind) => fetchLane((q) => q.eq("kind", kind))),
    fetchLane((q) => q.not("kind", "in", `(${HEAVY_KINDS.join(",")})`)),
  ]);
  const failed = lanes.find((lane) => lane.error);
  if (failed) return failed;
  const all = lanes.flatMap((lane) => lane.data);
  // Urutan waktu dipertahankan agar baris terakhir tetap menjadi kursor.
  all.sort((a, b) => (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0));
  return { data: all, error: null };
}

type Shadow = Record<string, string>;
/** Baris yang menunggu dikirim, plus daftar kolom yang benar-benar diubah di perangkat ini. */
type Pending = Intent;
type Outbox = Record<string, Pending>;

const pendingRows = (storeId: string) => intentPersistence().queues(storeId).flatMap(queue => Object.values(queue.outbox));
const persistQueues = (storeId: string) => {
  for (const queue of intentPersistence().queues(storeId)) intentPersistence().persist(queue);
};
const reconcileQueues = (storeId: string, records: SyncRecord[]) => {
  let conflicts = 0;
  for (const queue of intentPersistence().queues(storeId)) {
    const next = structuredClone(queue.outbox);
    conflicts += reconcileIntents(next, records, preserveConflicts);
    intentPersistence().persist({ ...queue, outbox: next });
    queue.outbox = next;
  }
  return conflicts;
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** JSON dengan urutan kunci tetap, supaya perbandingan tidak terpengaruh urutan. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* penyimpanan penuh: tetap jalan di memori */
  }
}

export type SyncStatus = {
  online: boolean;
  syncing: boolean;
  pending: number;
  storeId: string | null;
  lastSyncedAt: number | null;
  error: string | null;
  flushNow: () => void;
  /** Paksa cocokkan ulang seluruh data store dengan pusat sekarang. */
  resyncNow: () => void;
  /** Data store sudah dicocokkan dengan pusat (atau perangkat sedang offline). */
  ready: boolean;
};

export function useStoreSync(options: {
  state: BillingSnapshot;
  hydrated: boolean;
  enabled: boolean;
  /**
   * True bila data lokal benar-benar dibaca dari penyimpanan perangkat. False
   * berarti aplikasi berjalan dari isi bawaan (penyimpanan kosong, penuh, atau
   * rusak) — dalam keadaan itu perangkat wajib mengambil ulang data store dari
   * pusat sebelum boleh mengirim apa pun.
   */
  storageLoaded: boolean;
  intents: IntentQueue;
  applyRemote: (apply: (prev: BillingSnapshot) => BillingSnapshot) => void;
  /**
   * Mengikat data lokal ke satu store. Kalau perangkat sebelumnya memegang data
   * store lain, data itu dibuang dan state baru langsung bertanda store ini.
   */
  bindStore: (storeId: string, keepLocal?: boolean) => void;
}): SyncStatus {
  const { state, hydrated, enabled, storageLoaded, intents, applyRemote, bindStore } =
    options;

  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [readyStoreId, setReadyStoreId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberAttempt, setMemberAttempt] = useState(0);
  const [bootAttempt, setBootAttempt] = useState(0);


  const shadowRef = useRef<Shadow>({});
  const outboxRef = useRef<Outbox>({});
  const busyRef = useRef(false);
  const loadedRef = useRef(false);
  const stateRef = useRef(state);
  const prevKeysRef = useRef<Set<string> | null>(null);
  // Sudahkah data lokal dicocokkan dengan salinan pusat sejak aplikasi dibuka?
  const blockedUntilRef = useRef(0);
  /** Sudah pernah mengambil seluruh data store pada sesi ini. */
  const bootstrappedRef = useRef(false);
  /**
   * Kapan terakhir perangkat ini mencocokkan SELURUH data store dengan pusat.
   * Pengambilan berdasarkan "perubahan sejak ..." bisa melewatkan baris bila
   * jejak waktu perangkat sempat maju (jam meleset, halaman ditutup saat
   * pengambilan, penyimpanan penuh). Pencocokan penuh berkala menutup celah itu
   * tanpa perlu tindakan dari pengguna.
   */
  const lastAuditRef = useRef(0);
  const AUDIT_EVERY_MS = 3 * 60 * 1000;



  stateRef.current = state;

  // Muat antrean & bayangan dari perangkat.
  useEffect(() => {
    shadowRef.current = readJson<Shadow>(SHADOW_KEY, {});
    // Old unscoped queues have no provable store identity. Keep them untouched.
    const hasLegacy = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .some(key => {
        if (!key || (key !== LEGACY_OUTBOX_KEY && !/^billing-intents-.+-(outbox|journal)$/.test(key))) return false;
        const value = readJson<unknown>(key, null);
        return !!value && typeof value === 'object' && Object.keys(value).length > 0;
      });
    if (hasLegacy) toast.warning('Antrean lama tanpa identitas toko tetap disimpan untuk pemeriksaan; tidak dikirim otomatis.', { duration: 15000 });
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    loadedRef.current = true;
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Cari store milik pengguna yang sedang masuk.
  useEffect(() => {
    if (!enabled) {
      setStoreId(null);
      setReadyStoreId(null);
      return;
    }
    const cached = typeof window === "undefined" ? null : localStorage.getItem(STORE_KEY);
    // Saat daring, jangan mulai sinkronisasi dari store cache. Akun Developer
    // dapat memilih store berbeda di perangkat lain, sehingga cache lama bisa
    // membuat data store A diterapkan ke store B sebelum membership terbaca.
    if (cached && typeof navigator !== "undefined" && !navigator.onLine) {
      setStoreId(cached);
      // Tanpa internet, data lokal yang sudah bertanda store ini boleh langsung
      // dicatat ke antrean kirim supaya transaksi hari ini tidak hilang.
      // Queue recovery must finish before admitting any offline mutations.
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const fail = () => {
      if (cancelled) return;
      // Coba lagi: kegagalan jaringan tidak boleh membuat perangkat berhenti
      // menyinkronkan sepanjang sesi.
      retry = setTimeout(() => {
        if (!cancelled) setMemberAttempt((n) => n + 1);
      }, 8000);
    };
    (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const userId = auth.user?.id;
        if (!userId) return;
        const { data, error: memberError } = await supabase
          .from("store_members")
          .select("store_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (memberError) throw memberError;
        const id = (data as { store_id: string } | null)?.store_id ?? null;
        if (!id) {
          setError("Akun belum terhubung ke store. Hubungi Admin atau Developer.");
          return;
        }
        const localStore = stateRef.current.storeId;
        // Perangkat yang datanya belum bertanda store, tapi sudah pernah
        // menyinkronkan store ini (versi aplikasi sebelumnya), datanya memang
        // milik store ini. Jangan dihapus: bisa berisi transaksi saat internet
        // mati yang belum terkirim.
        const hasSyncHistory =
          Object.keys(shadowRef.current).length > 0 ||
          Object.keys(outboxRef.current).length > 0 ||
          Boolean(localStorage.getItem(SINCE_KEY));
        const adopt = !localStore && hasSyncHistory && (cached === null || cached === id);
        if (localStore !== id && !adopt) {
          // Data lokal milik store lain (atau data bawaan yang belum bertanda
          // store): buang jejak sinkronisasi lama supaya tidak ikut terkirim.
          localStorage.removeItem(SHADOW_KEY);
          localStorage.removeItem(SINCE_KEY);
          // Tandai bahwa data lokal baru saja dikosongkan, jadi isi pusat aman
          // dipakai sebagai satu-satunya sumber saat pengambilan pertama.
          localStorage.setItem(FRESH_KEY, id);
          shadowRef.current = {};
          outboxRef.current = {};
          prevKeysRef.current = null;
          setPending(0);
          setReadyStoreId(null);
        }
        bindStore(id, adopt);
        localStorage.setItem(STORE_KEY, id);
        setStoreId(id);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // Sesi kedaluwarsa: segarkan sekali, kalau gagal antar ke halaman masuk.
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        if (isSessionInvalid(err) && !offline) {
          const recovered = await recoverSession();
          if (!recovered) return;
        }
        fail();
      }
    })();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [enabled, bindStore, memberAttempt]);


  const queueLocalChanges = useCallback((snapshot: BillingSnapshot, activeStoreId: string) => {
    // Kunci utama: hanya data yang memang bertanda store ini yang boleh masuk
    // antrean kirim. Ini yang mencegah data store lain berpindah.
    if (snapshot.storeId !== activeStoreId) return;
    const queued = intents.current.slice();
    if (!queued.length) return;
    // Only changed entities from an explicit local mutation can be published.
    const normalized: Intent[] = [];
    for (const transaction of new Set(queued.map(i => i.transaction))) {
      const records = queued.filter(i => i.transaction === transaction).map(intent => {
        const key = recordKey(intent.kind, intent.entity_id);
        return bootstrappedRef.current && shadowRef.current[key] === undefined && !pendingRows(activeStoreId).some(row => recordKey(row.kind, row.entity_id) === key)
          ? { ...intent, base: null }
          : intent;
      });
      normalized.push(...records);
    }
    intentPersistence().drainOwn(activeStoreId, normalized);
    intents.current.splice(0, queued.length);
    const own = intentPersistence().ownQueue(activeStoreId);
    if (own) outboxRef.current = own.outbox;
    setPending(pendingRows(activeStoreId).length);
  }, [intents]);

  useEffect(() => {
    if (!hydrated || !loadedRef.current || !storeId || readyStoreId !== storeId) return;
    try { queueLocalChanges(state, storeId); }
    catch { setError('Transaksi belum aman tersimpan. Jangan tutup aplikasi; periksa ruang penyimpanan perangkat.'); }
  }, [state, hydrated, storeId, readyStoreId, queueLocalChanges]);

  const noteShadow = useCallback((records: SyncRecord[]) => {
    for (const record of records) {
      const key = recordKey(record.kind, record.entity_id);
      if (record.deleted) delete shadowRef.current[key];
      else shadowRef.current[key] = stableStringify(record.payload);
    }
    writeJson(SHADOW_KEY, shadowRef.current);
  }, []);

  // Perangkat baru wajib mengambil data pusat lebih dulu. Tanpa tahap ini,
  // data bawaan (PS3/PS4/PS5) dapat terkirim dan menimpa pengaturan store.
  useEffect(() => {
    if (!storeId || !enabled || !hydrated || readyStoreId === storeId) return;
    // Tunggu sampai data lokal resmi bertanda store ini.
    if (stateRef.current.storeId !== storeId) return;

    const hasSyncHistory =
      Object.keys(shadowRef.current).length > 0 ||
      Object.keys(outboxRef.current).length > 0 ||
      Boolean(localStorage.getItem(SINCE_KEY));
    if (hasSyncHistory && !storageLoaded) {
      localStorage.removeItem(SHADOW_KEY);
      localStorage.removeItem(SINCE_KEY);
      localStorage.setItem(FRESH_KEY, storeId);
      shadowRef.current = {};
      outboxRef.current = {};
      prevKeysRef.current = null;
      setPending(0);
    }


    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      try {
        await intentPersistence().open(storeId);
        if (cancelled || stateRef.current.storeId !== storeId) return;
        const own = intentPersistence().ownQueue(storeId);
        if (own) outboxRef.current = own.outbox;
        queueLocalChanges(stateRef.current, storeId);
        setPending(pendingRows(storeId).length);
        if (cancelled) return;
        if (!navigator.onLine) {
          applyRemote(prev => applyRecords(prev, pendingRows(storeId)));
          setReadyStoreId(storeId);
          return;
        }
      // Baseline lengkap mengganti seluruh daftar lokal, jadi baris terhapus
      // tidak diperlukan dan tidak diunduh (bisa puluhan ribu baris kosong).
      const { data, error: bootstrapError } = await fetchAllStoreData(storeId, null, true);
      if (cancelled) return;
      if (bootstrapError) {
        setError(bootstrapError.message);
        // Ulangi sampai berhasil. Tanpa ini, satu kegagalan jaringan membuat
        // perangkat berhenti menyinkronkan sepanjang sesi.
        retry = setTimeout(() => {
          if (!cancelled) setBootAttempt((n) => n + 1);
        }, 8000);
        return;
      }

      const remote = (data ?? []) as {
        kind: string;
        entity_id: string;
        payload: Record<string, unknown>;
        deleted: boolean;
        updated_at: string;
      }[];
      queueLocalChanges(stateRef.current, storeId);
      const records: SyncRecord[] = remote.map(row => ({ ...row, payload: row.payload ?? {} }));
      if (reconcileQueues(storeId, records)) {
        toast.warning('Perubahan bertabrakan dengan data pusat. Data terbaru dimuat; periksa lalu ulangi tindakan yang masih diperlukan.', { duration: 15000 });
      }
      // Includes the empty-server case: cached entities never become new writes.
      const pendingRecords = pendingRows(storeId);
      applyRemote(prev => applyRecords(applyRecords(clearSyncedLists(prev), records), pendingRecords));
      shadowRef.current = {};
      noteShadow(records);
      persistQueues(storeId);
      setPending(pendingRecords.length);
      const newest = remote.at(-1)?.updated_at;
      if (newest) localStorage.setItem(SINCE_KEY, newest);
      localStorage.removeItem(FRESH_KEY);
      // Ditulis hanya setelah seluruh halaman berhasil diterapkan. Perangkat
      // dengan data parsial dari versi lama otomatis mengulang proses ini.
      localStorage.setItem(BASELINE_KEY, `${storeId}:${BASELINE_VERSION}`);
      bootstrappedRef.current = true;
      setError(null);
      setReadyStoreId(storeId);
      } catch (failure) {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : 'Pemulihan transaksi luring belum berhasil. Jangan hapus data perangkat.');
          retry = setTimeout(() => setBootAttempt(n => n + 1), 8000);
        }
      }
    })();


    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [
    storeId,
    enabled,
    hydrated,
    readyStoreId,
    state.storeId,
    bootAttempt,
    storageLoaded,
    applyRemote,
    noteShadow,
    queueLocalChanges,
  ]);


  const sync = useCallback(async () => {
    if (!storeId || readyStoreId !== storeId || busyRef.current || !navigator.onLine) return;
    // Jeda setelah penolakan aturan baris: data lokal tetap tersimpan di antrean.
    if (Date.now() < blockedUntilRef.current) return;

    busyRef.current = true;
    setSyncing(true);
    const stillCurrent = () => stateRef.current.storeId === storeId && localStorage.getItem(STORE_KEY) === storeId;
    try {
      // Pastikan pilihan store di perangkat masih sama dengan membership di
      // pusat. Ini penting untuk akun Developer yang dapat berganti store dari
      // perangkat lain. Jika berubah, hentikan sebelum satu baris pun diterapkan.
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!stillCurrent()) return;
      if (authError) throw authError;
      const userId = auth.user?.id;
      if (!userId) return;
      const { data: membership, error: membershipError } = await supabase
        .from("store_members")
        .select("store_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (!stillCurrent()) return;
      if (membershipError) throw membershipError;
      const currentStoreId = (membership as { store_id: string } | null)?.store_id ?? null;
      if (!currentStoreId) throw new Error("Akun belum terhubung ke store.");
      if (currentStoreId !== storeId) {
        localStorage.removeItem(SHADOW_KEY);
        localStorage.removeItem(SINCE_KEY);
        localStorage.removeItem(BASELINE_KEY);
        localStorage.setItem(STORE_KEY, currentStoreId);
        localStorage.setItem(FRESH_KEY, currentStoreId);

        shadowRef.current = {};
        outboxRef.current = {};
        prevKeysRef.current = null;
        setPending(0);
        setReadyStoreId(null);
        bindStore(currentStoreId);
        setStoreId(currentStoreId);
        return;
      }
      // Data lokal harus bertanda store ini. Kalau tidak, jangan kirim apa pun.
      if (stateRef.current.storeId !== storeId) {
        bindStore(storeId);
        return;
      }

      // Tangkap perubahan terbaru sekali lagi tepat sebelum tukar data. Ini menutup
      // celah antara render, efek React, dan sinkronisasi berkala/fokus layar.
      queueLocalChanges(stateRef.current, storeId);

      // 1. Ambil perubahan dari pusat lebih dulu. Kalau mengirim dulu, perangkat
      // yang datanya masih lama akan menimpa perubahan perangkat lain.
      // Setiap beberapa menit, cocokkan seluruh data store (bukan hanya yang
      // berubah) supaya daftar TV, shift, dan menu selalu utuh di semua
      // perangkat walau ada baris yang pernah terlewat.
      const auditNow = Date.now() - lastAuditRef.current >= AUDIT_EVERY_MS;
      const since = auditNow ? null : (localStorage.getItem(SINCE_KEY) ?? EPOCH);
      // Audit penuh hanya mengambil baris aktif lalu MENGGANTI daftar lokal,
      // sehingga baris terhapus yang menumpuk tidak perlu diunduh ulang.
      const { data, error: pullError } = await fetchAllStoreData(storeId, since, auditNow);
      if (!stillCurrent()) return;
      if (pullError) throw new Error(pullError.message);
      if (auditNow) lastAuditRef.current = Date.now();
      // Include actions committed while the network read was in flight before
      // applying its result, so the fresh read cannot erase a just-entered edit.
      queueLocalChanges(stateRef.current, storeId);

      const remote = (data ?? []) as {
        kind: string;
        entity_id: string;
        payload: Record<string, unknown>;
        deleted: boolean;
        updated_at: string;
      }[];
      if (remote.length) {
        const records: SyncRecord[] = remote.map(row => ({ ...row, payload: row.payload ?? {} }));
        const conflicts = reconcileQueues(storeId, records);
        if (conflicts) {
          toast.warning('Perubahan antarperangkat bertabrakan. Data pusat dipertahankan; periksa lalu ulangi tindakan Anda.', { duration: 15000 });
        }
        if (auditNow) {
          applyRemote(prev => applyRecords(applyRecords(clearSyncedLists(prev), records), pendingRows(storeId)));
          shadowRef.current = {};
        } else if (conflicts) {
          const full = await fetchAllStoreData(storeId, null, true);
          if (!stillCurrent()) return;
          if (full.error) throw new Error(full.error.message);
          applyRemote(prev => applyRecords(applyRecords(clearSyncedLists(prev), full.data), pendingRows(storeId)));
        } else {
          applyRemote(prev => applyRecords(applyRecords(prev, records), pendingRows(storeId)));
        }
        noteShadow(records);
        persistQueues(storeId);
        setPending(pendingRows(storeId).length);
        const newest = remote.at(-1)?.updated_at;
        const cursor = localStorage.getItem(SINCE_KEY);
        if (newest && (!cursor || newest > cursor)) localStorage.setItem(SINCE_KEY, newest);
      }

      // 2. Kirim perubahan lokal yang tersisa.
      for (const queue of intentPersistence().queues(storeId)) {
      let outbox = queue.outbox;
      const keys = Object.keys(outbox);
      if (keys.length) {
        const sentByKey = new Map(
          keys.flatMap((key) => {
            const record = outbox[key];
            return record ? [[key, record] as const] : [];
          }),
        );
        const rows = Array.from(sentByKey.values());
        const { data: result, error: pushError } = await supabase.rpc('store_apply_intents', {
          _store_id: storeId,
          _records: rows as never,
        });
        if (!stillCurrent()) return;
        // Journal draining can replace the outbox while the request is in flight.
        // Acknowledge against the latest queue, never a detached older object.
        outbox = queue.outbox;
        if (pushError && pushError.code !== 'P0001') throw pushError;
        const response = pushError
          ? { accepted: false, records: [] }
          : result as unknown as { accepted: boolean; records: SyncRecord[] };
        if (!response.accepted) {
          preserveConflicts(Array.from(sentByKey.values()));
          // The entire send is atomic: no orphan receipt/VOID on a rejected station.
          for (const [key, sentRecord] of sentByKey) {
            const current = outbox[key];
            if (current?.transaction === sentRecord.transaction) delete outbox[key];
          }
          const full = await fetchAllStoreData(storeId, null, true);
          if (!stillCurrent()) return;
          if (full.error) throw new Error(full.error.message);
          applyRemote(prev => applyRecords(applyRecords(clearSyncedLists(prev), full.data), pendingRows(storeId)));
          toast.warning('Pusat menolak kiriman yang sudah tertinggal. Data terbaru dimuat; periksa dan ulangi tindakan yang diperlukan.', { duration: 15000 });
        } else {
          for (const [key, sentRecord] of sentByKey) {
            const current = outbox[key];
            if (current && canonical(current) === canonical(sentRecord)) delete outbox[key];
            else if (current) current.base = sentRecord.deleted ? null : sentRecord.payload;
          }
          noteShadow(response.records);
        }
        intentPersistence().persist(queue);
        setPending(pendingRows(storeId).length);
        // Never advance the pull cursor from push timestamps: another device's
        // intervening update has not yet been read and would otherwise be skipped.
      }
      }
      setError(null);
      setLastSyncedAt(Date.now());
    } catch (err) {
      const message =
        (err as { message?: string } | null)?.message ?? "Sinkronisasi gagal";
      // Sesi sudah tidak sah: jangan ulangi permintaan yang pasti ditolak.
      if (isSessionInvalid(err)) {
        const recovered = await recoverSession();
        if (!recovered) {
          setError("Sesi masuk sudah berakhir. Silakan masuk kembali.");
          return;
        }
      }
      // Penolakan aturan baris berarti akun ini tidak (lagi) terhubung ke store
      // yang dipakai, atau sesinya kedaluwarsa. Coba segarkan sesi sekali, lalu
      // beri jeda supaya tidak menabrak pusat setiap 20 detik tanpa hasil.
      if (/row-level security|row level security/i.test(message)) {
        blockedUntilRef.current = Date.now() + 5 * 60 * 1000;
        await supabase.auth.refreshSession().catch(() => null);
        setError(
          "Data belum bisa disimpan ke pusat: akun ini belum terhubung ke store yang dipakai, atau sesinya kedaluwarsa. Keluar lalu masuk kembali, atau hubungi Admin.",
        );
      } else {
        setError(message);
      }
    } finally {
      busyRef.current = false;
      setSyncing(false);
    }

  }, [storeId, readyStoreId, applyRemote, noteShadow, queueLocalChanges, bindStore]);


  // Segera kirim begitu ada perubahan yang menunggu.
  useEffect(() => {
    if (!storeId || readyStoreId !== storeId || !enabled || pending === 0) return;
    const timer = setTimeout(() => void sync(), 1200);
    return () => clearTimeout(timer);
  }, [pending, storeId, readyStoreId, enabled, sync]);

  // Jalankan sinkronisasi saat daring, saat layar aktif, dan berkala.
  useEffect(() => {
    if (!storeId || readyStoreId !== storeId || !enabled) return;
    void sync();
    const id = setInterval(() => void sync(), 20000);
    const wake = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", wake);
    const reconnect = () => void sync();
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", wake);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", wake);
    };
  }, [storeId, readyStoreId, enabled, sync]);

  // Dengarkan perubahan pusat secara langsung: begitu kasir mengubah sesuatu di
  // tablet, perangkat lain menyusul dalam hitungan detik, tanpa menunggu
  // pemeriksaan berkala.
  useEffect(() => {
    if (!storeId || readyStoreId !== storeId || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`store-data-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_data", filter: `store_id=eq.${storeId}` },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void sync(), 800);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [storeId, readyStoreId, enabled, sync]);

  return {
    online,
    syncing,
    pending,
    storeId,
    lastSyncedAt,
    error,
    ready: Boolean(storeId && readyStoreId === storeId),
    flushNow: () => void sync(),
    resyncNow: () => {
      lastAuditRef.current = 0;
      void sync();
    },
  };

}
