import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Satu perangkat yang diizinkan bertransaksi di store ini. */
export type AllowedDevice = {
  code: string;
  label: string;
};

export type StoreInfo = {
  id: string;
  store_code: string;
  store_name: string;
  store_email: string;
  address: string;
  city: string;
  owner_name: string;
  phone: string;
  app_version: string;
  dev_contact: string;
  expires_at: string | null;
  active: boolean;
  logo_url: string;
  device_code: string;
  allowed_ips: string[];
  allowed_devices: AllowedDevice[];
};

/** Ubah isi kolom daftar perangkat menjadi bentuk yang aman dipakai. */
export function normalizeDevices(value: unknown): AllowedDevice[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { code: item.trim(), label: "" };
      const row = item as { code?: unknown; label?: unknown };
      return {
        code: typeof row?.code === "string" ? row.code.trim() : "",
        label: typeof row?.label === "string" ? row.label : "",
      };
    })
    .filter((d) => d.code.length > 0);
}

const CACHE_KEY = "billing-store-info-v1";


const COLUMNS =
  "id, store_code, store_name, store_email, address, city, owner_name, phone, app_version, dev_contact, expires_at, active, logo_url, device_code, allowed_ips, allowed_devices";


function readCache(): StoreInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as StoreInfo) : null;
  } catch {
    return null;
  }
}

/**
 * Data store milik pengguna yang sedang masuk.
 * Nilai terakhir disimpan di perangkat agar masa aktif tetap berlaku saat luring.
 */
export function useStoreInfo(enabled: boolean) {
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(enabled);
  /** true bila data store di atas benar-benar baru dibaca dari server (bukan salinan lama). */
  const [fresh, setFresh] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("rentoplay:store-info-updated", refresh);
    return () => window.removeEventListener("rentoplay:store-info-updated", refresh);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStore(null);
      setLoading(false);
      setFresh(false);
      return;
    }
    setStore(readCache());
    setFresh(false);
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("stores").select(COLUMNS).limit(1).maybeSingle();
      if (cancelled) return;
      const raw = data as (StoreInfo & { allowed_devices?: unknown }) | null;
      const row = raw ? { ...raw, allowed_devices: normalizeDevices(raw.allowed_devices) } : null;
      if (row) {
        setStore(row);
        setFresh(true);

        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(row));
        } catch {
          /* penyimpanan penuh */
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, revision]);

  return { store, loading, fresh };
}
