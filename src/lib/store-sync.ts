import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BillingSnapshot } from "./billing-store";
import {
  applyRecords,
  clearSyncedLists,
  flattenSnapshot,
  isDefaultProtectedSetting,
  isKnownKind,
  PROTECTED_SETTINGS,
  recordKey,
  SETTINGS_KIND,
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


const OUTBOX_KEY = "billing-sync-outbox-v1";
const SHADOW_KEY = "billing-sync-shadow-v1";
const SINCE_KEY = "billing-sync-since-v1";
const STORE_KEY = "billing-sync-store-v1";
const FRESH_KEY = "billing-sync-fresh-v1";
// Naikkan versi ini bila cara pengambilan data pusat berubah. Perangkat yang
// pernah menyimpan cursor dari versi lama wajib mengambil baseline lengkap
// sekali lagi; cursor lama tidak dapat menemukan baris yang dulu terlewat.
const BASELINE_KEY = "billing-sync-baseline-v1";
const BASELINE_VERSION = "all-pages-v1";


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
async function fetchAllStoreData(
  storeId: string,
  since: string | null,
  skipDeleted = false,
): Promise<{ data: RemoteRow[]; error: { message: string } | null }> {
  const PAGE = 1000;
  const all: RemoteRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("store_data")
      .select("kind, entity_id, payload, deleted, updated_at")
      .eq("store_id", storeId);
    if (since) q = q.gt("updated_at", since);
    // Hanya unduhan pertama (perangkat kosong) yang boleh melewati baris
    // terhapus. Audit penuh WAJIB menerimanya agar penghapusan yang
    // terlewat tetap dibersihkan dan kursor tidak melompatinya.
    else if (skipDeleted) q = q.eq("deleted", false);

    const { data, error } = await q
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
}

type Shadow = Record<string, string>;
/** Baris yang menunggu dikirim, plus daftar kolom yang benar-benar diubah di perangkat ini. */
type Pending = SyncRecord & { fields?: string[] };
type Outbox = Record<string, Pending>;

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

function parseJson(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Kolom mana saja yang berubah dibanding salinan terakhir dari pusat. */
function changedFields(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
  const out: string[] = [];
  for (const key of keys) {
    if (stableStringify(base[key]) !== stableStringify(next[key])) out.push(key);
  }
  return out;
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
  /** Kunci pengaturan yang memang diubah di perangkat ini. */
  dirtySettings: () => Set<string>;
  applyRemote: (apply: (prev: BillingSnapshot) => BillingSnapshot) => void;
  /**
   * Mengikat data lokal ke satu store. Kalau perangkat sebelumnya memegang data
   * store lain, data itu dibuang dan state baru langsung bertanda store ini.
   */
  bindStore: (storeId: string, keepLocal?: boolean) => void;
}): SyncStatus {
  const { state, hydrated, enabled, storageLoaded, dirtySettings, applyRemote, bindStore } =
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
  const initialCheckedRef = useRef(false);
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
    outboxRef.current = readJson<Outbox>(OUTBOX_KEY, {});
    setPending(Object.keys(outboxRef.current).length);
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
      if (stateRef.current.storeId === cached) setReadyStoreId(cached);
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
          localStorage.removeItem(OUTBOX_KEY);
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
    const current = flattenSnapshot(snapshot);
    const shadow = shadowRef.current;
    const outbox = outboxRef.current;
    let changed = false;

    // Pemeriksaan pertama setelah aplikasi dibuka: perubahan asli selalu sudah
    // masuk antrean saat dibuat. Baris yang berbeda dari salinan pusat tetapi
    // TIDAK ada di antrean berarti data lokal basi (mis. penyimpanan iPhone
    // gagal menulis data terbaru). Jangan kirim — kembalikan ke salinan pusat.
    if (!initialCheckedRef.current) {
      initialCheckedRef.current = true;
      const restore: SyncRecord[] = [];
      for (const [key, record] of current) {
        const known = shadow[key];
        if (known === undefined || outbox[key]) continue;
        if (known === stableStringify(record.payload)) continue;
        const payload = parseJson(known);
        if (payload) restore.push({ ...record, payload, deleted: false });
      }
      prevKeysRef.current = new Set(current.keys());
      if (restore.length) {
        applyRemote((prev) => applyRecords(prev, restore));
        return;
      }
    }

    const dirty = dirtySettings();
    for (const [key, record] of current) {
      const json = stableStringify(record.payload);
      if (shadow[key] === json) continue;
      // Jenis Konsol, Tarif per Jam, dan potongan harga konsol hanya dikirim
      // bila memang diubah dari perangkat ini. Dan isi bawaan tidak pernah
      // dikirim sebelum perangkat ini menerima data store dari pusat.
      if (record.kind === SETTINGS_KIND && PROTECTED_SETTINGS.has(record.entity_id)) {
        if (!dirty.has(record.entity_id)) continue;
        // Isi bawaan aplikasi tidak pernah dikirim ke pusat. Perangkat yang
        // datanya tergerus (penyimpanan penuh, data browser dibersihkan)
        // karena itu tidak bisa lagi mengembalikan tarif store ke awal.
        if (isDefaultProtectedSetting(record.entity_id, record.payload)) continue;
      }
      // Catat kolom mana yang diubah di perangkat ini, supaya kolom lain
      // tidak ikut menimpa perubahan perangkat lain pada baris yang sama.
      const base = parseJson(shadow[key]);
      const fields = base ? changedFields(base, record.payload) : Object.keys(record.payload);
      const prev = outbox[key];
      const before = prev && !prev.deleted ? (prev.fields ?? Object.keys(prev.payload)) : [];
      outbox[key] = { ...record, fields: Array.from(new Set([...before, ...fields])) };
      changed = true;
    }
    // Hanya baris yang benar-benar dihapus di perangkat ini yang boleh
    // dihapus di pusat: baris itu harus ada di snapshot sebelumnya.
    const prevKeys = prevKeysRef.current;
    if (prevKeys) {
      for (const key of Object.keys(shadow)) {
        if (current.has(key) || !prevKeys.has(key)) continue;
        const [kind, ...rest] = key.split(":");
        if (!kind || !isKnownKind(kind)) continue;
        outbox[key] = {
          kind,
          entity_id: rest.join(":"),
          payload: {},
          deleted: true,
        };
        changed = true;
      }
    }
    prevKeysRef.current = new Set(current.keys());


    if (changed) {
      writeJson(OUTBOX_KEY, outbox);
      setPending(Object.keys(outbox).length);
    }
  }, [dirtySettings, applyRemote]);

  // Catat perubahan lokal langsung. Jangan beri kesempatan tarikan berkala
  // menimpa pengaturan yang baru diubah sebelum masuk antrean kirim.
  useEffect(() => {
    if (!hydrated || !loadedRef.current || !storeId || readyStoreId !== storeId) return;
    queueLocalChanges(state, storeId);
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
    const hasCompleteBaseline =
      localStorage.getItem(BASELINE_KEY) === `${storeId}:${BASELINE_VERSION}`;
    // Jejak sinkron lama hanya bisa dipercaya bila data lokalnya juga benar-benar
    // terbaca. Kalau data lokal hilang (penyimpanan penuh/rusak) sementara
    // jejaknya masih ada, perangkat ini akan mengirim isi bawaan ke pusat —
    // inilah yang membuat Jenis Konsol & Tarif ter-reset. Paksa ambil ulang.
    if (hasSyncHistory && storageLoaded && hasCompleteBaseline) {
      // Tanpa internet: pakai data perangkat supaya kasir tetap bisa bekerja.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        bootstrappedRef.current = true;
        setReadyStoreId(storeId);
        return;
      }
      // Daring: susul dulu perubahan pusat sejak terakhir tersambung (hanya
      // baris yang berubah — hemat kuota). Baris yang sudah diubah perangkat
      // lain selama perangkat ini tidak aktif SELALU mengikuti pusat; antrean
      // lama untuk baris itu dibuang agar tidak menimpa data kasir aktif.
      // Transaksi baru yang dibuat saat offline (belum ada di pusat) tetap dikirim.
      let cancelledFast = false;
      let retryFast: ReturnType<typeof setTimeout> | null = null;
      void (async () => {
        const since = localStorage.getItem(SINCE_KEY) ?? EPOCH;
        const { data, error: catchError } = await fetchAllStoreData(storeId, since);
        if (cancelledFast) return;
        if (catchError) {
          if (!navigator.onLine) {
            bootstrappedRef.current = true;
            setReadyStoreId(storeId);
            return;
          }
          retryFast = setTimeout(() => {
            if (!cancelledFast) setBootAttempt((n) => n + 1);
          }, 5000);
          return;
        }
        const remote = (data ?? []) as {
          kind: string;
          entity_id: string;
          payload: Record<string, unknown>;
          deleted: boolean;
          updated_at: string;
        }[];
        if (remote.length) {
          const records: SyncRecord[] = remote.map((row) => ({
            kind: row.kind,
            entity_id: row.entity_id,
            payload: row.payload ?? {},
            deleted: row.deleted,
          }));
          for (const r of records) delete outboxRef.current[recordKey(r.kind, r.entity_id)];
          writeJson(OUTBOX_KEY, outboxRef.current);
          setPending(Object.keys(outboxRef.current).length);
          applyRemote((prev) => applyRecords(prev, records));
          noteShadow(records);
          const newest = remote.at(-1)?.updated_at;
          if (newest) localStorage.setItem(SINCE_KEY, newest);
        }
        bootstrappedRef.current = true;
        setError(null);
        setReadyStoreId(storeId);
      })();
      return () => {
        cancelledFast = true;
        if (retryFast) clearTimeout(retryFast);
      };
    }
    if (hasSyncHistory && !storageLoaded) {
      localStorage.removeItem(SHADOW_KEY);
      localStorage.removeItem(OUTBOX_KEY);
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
      if (remote.length > 0) {
        const records: SyncRecord[] = remote.map((row) => ({
          kind: row.kind,
          entity_id: row.entity_id,
          payload: row.payload ?? {},
          deleted: row.deleted,
        }));
        // Baseline lengkap harus mengganti seluruh daftar hasil sinkron lama.
        // Kalau hanya ditumpuk, baris lokal yang sudah tidak ada di pusat tetap
        // hidup dan perangkat dapat terus menampilkan baseline bawaan/parsial.
        // Perubahan offline tetap aman karena antrean lokal diterapkan kembali
        // di atas baseline pusat, lalu dikirim pada tahap sinkron berikutnya.
        const pendingRecords = Object.values(outboxRef.current);
        applyRemote((prev) =>
          applyRecords(applyRecords(clearSyncedLists(prev), records), pendingRecords),
        );
        noteShadow(records);
        const newest = remote.at(-1)?.updated_at;
        if (newest) localStorage.setItem(SINCE_KEY, newest);
      }
      localStorage.removeItem(FRESH_KEY);
      // Ditulis hanya setelah seluruh halaman berhasil diterapkan. Perangkat
      // dengan data parsial dari versi lama otomatis mengulang proses ini.
      localStorage.setItem(BASELINE_KEY, `${storeId}:${BASELINE_VERSION}`);
      bootstrappedRef.current = true;
      setError(null);
      setReadyStoreId(storeId);
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
  ]);


  const sync = useCallback(async () => {
    if (!storeId || readyStoreId !== storeId || busyRef.current || !navigator.onLine) return;
    // Jeda setelah penolakan aturan baris: data lokal tetap tersimpan di antrean.
    if (Date.now() < blockedUntilRef.current) return;

    busyRef.current = true;
    setSyncing(true);
    try {
      // Pastikan pilihan store di perangkat masih sama dengan membership di
      // pusat. Ini penting untuk akun Developer yang dapat berganti store dari
      // perangkat lain. Jika berubah, hentikan sebelum satu baris pun diterapkan.
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = auth.user?.id;
      if (!userId) return;
      const { data: membership, error: membershipError } = await supabase
        .from("store_members")
        .select("store_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (membershipError) throw membershipError;
      const currentStoreId = (membership as { store_id: string } | null)?.store_id ?? null;
      if (!currentStoreId) throw new Error("Akun belum terhubung ke store.");
      if (currentStoreId !== storeId) {
        localStorage.removeItem(SHADOW_KEY);
        localStorage.removeItem(OUTBOX_KEY);
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
      const { data, error: pullError } = await fetchAllStoreData(storeId, since);
      if (pullError) throw new Error(pullError.message);
      if (auditNow) lastAuditRef.current = Date.now();

      const remote = (data ?? []) as {
        kind: string;
        entity_id: string;
        payload: Record<string, unknown>;
        deleted: boolean;
        updated_at: string;
      }[];
      if (remote.length) {
        // Gabungkan per kolom: kolom yang diubah di perangkat ini dipertahankan,
        // kolom lain diambil dari pusat. Dua kasir yang mengubah bagian berbeda
        // pada baris yang sama tidak lagi saling menimpa.
        const merged: SyncRecord[] = [];
        for (const row of remote) {
          const record: SyncRecord = {
            kind: row.kind,
            entity_id: row.entity_id,
            payload: row.payload ?? {},
            deleted: row.deleted,
          };
          const key = recordKey(record.kind, record.entity_id);
          const pending = outboxRef.current[key];
          // Baris yang sudah dihapus di pusat selalu menang. Kalau tidak,
          // perangkat yang masih menyimpan salinan lama akan menghidupkannya
          // kembali — inilah yang membuat unit store lain muncul lagi.
          if (record.deleted) {
            delete outboxRef.current[key];
            merged.push(record);
            continue;
          }
          if (!pending) {
            merged.push(record);
            continue;
          }
          // Penghapusan lokal tetap dikirim ke pusat.
          if (pending.deleted) continue;

          const fields = pending.fields ?? Object.keys(pending.payload);
          const payload = { ...record.payload };
          for (const field of fields) {
            if (field in pending.payload) payload[field] = pending.payload[field];
            else delete payload[field];
          }
          const mergedRecord: SyncRecord = { ...record, payload };
          merged.push(mergedRecord);
          outboxRef.current[key] = { ...pending, payload };
        }
        if (merged.length) {
          applyRemote((prev) => applyRecords(prev, merged));
          noteShadow(merged);
        }
        writeJson(OUTBOX_KEY, outboxRef.current);
        const newest = remote[remote.length - 1]!.updated_at;
        localStorage.setItem(SINCE_KEY, newest);
      }

      // 2. Kirim perubahan lokal yang tersisa.
      const outbox = outboxRef.current;
      const keys = Object.keys(outbox);
      if (keys.length) {
        const sentByKey = new Map(
          keys.flatMap((key) => {
            const record = outbox[key];
            return record ? [[key, record] as const] : [];
          }),
        );
        const rows = Array.from(sentByKey.values()).map((record) => ({
          store_id: storeId,
          kind: record.kind,
          entity_id: record.entity_id,
          payload: record.payload,
          deleted: record.deleted,
        }));
        // Waktu perubahan ditentukan oleh pusat (nilai bawaan + pemicu tabel),
        // bukan jam perangkat: jam yang meleset bisa membuat perubahan
        // perangkat lain tidak pernah terbaca.
        const { data: pushed, error: pushError } = await supabase
          .from("store_data")
          .upsert(rows as never, { onConflict: "store_id,kind,entity_id" })
          .select("updated_at");
        if (pushError) throw new Error(pushError.message);
        const sent = Array.from(sentByKey.values());
        for (const [key, sentRecord] of sentByKey) {
          const currentRecord = outbox[key];
          if (currentRecord && stableStringify(currentRecord) === stableStringify(sentRecord)) {
            delete outbox[key];
          }
        }
        writeJson(OUTBOX_KEY, outbox);
        setPending(Object.keys(outbox).length);
        noteShadow(sent);
        // Baris yang baru saja dikirim tidak perlu ditarik ulang.
        const stamps = ((pushed ?? []) as { updated_at: string }[]).map((r) => r.updated_at);
        const newest = stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null;
        const currentSince = localStorage.getItem(SINCE_KEY) ?? EPOCH;
        if (newest && newest > currentSince) localStorage.setItem(SINCE_KEY, newest);
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
