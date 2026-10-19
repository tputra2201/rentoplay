import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CHANGELOG } from "@/lib/changelog";

/** Versi aplikasi otomatis mengikuti entri teratas Change Log. */
const autoAppVersion = () => CHANGELOG[0]?.version ?? "";

/** Paksa versi dari Change Log pada setiap sumber branding (cache/db/event). */
function withAutoVersion(b: Branding): Branding {
  return { ...b, app_version: autoAppVersion() };
}

export type Branding = {
  logo_url: string;
  app_icon_url: string;
  login_title: string;
  login_note: string;
  app_name: string;
  app_version: string;
  release_date: string;
  developer_name: string;
  developer_email: string;
  developer_contact: string;
};

export const defaultBranding: Branding = {
  logo_url: "",
  app_icon_url: "",
  login_title: "RENTOPLAY",
  login_note: "",
  app_name: "",
  app_version: "",
  release_date: "",
  developer_name: "",
  developer_email: "",
  developer_contact: "",
};

const COLUMNS =
  "logo_url, app_icon_url, login_title, login_note, app_name, app_version, release_date, developer_name, developer_email, developer_contact";

/** Contoh hasil: "RenToPlay v1.0 - 081282284411" */
export function brandingSignature(b: Branding) {
  const name = b.app_name.trim();
  const version = b.app_version.trim();
  const contact = b.developer_contact.trim();
  return [[name, version].filter(Boolean).join(" "), contact]
    .filter(Boolean)
    .join(" - ");
}

const CACHE_KEY = "billing-branding-v1";
const BRANDING_EVENT = "billing-branding-updated";

function readCache(): Branding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Branding) : null;
  } catch {
    return null;
  }
}

/** Perbarui identitas di tab aktif agar judul dan ikon langsung ikut berubah. */
export function updateBrandingCache(patch: Partial<Branding>) {
  if (typeof window === "undefined") return;
  const next = { ...defaultBranding, ...readCache(), ...patch };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* penyimpanan penuh */
  }
  window.dispatchEvent(new CustomEvent<Branding>(BRANDING_EVENT, { detail: next }));
}

/** Tampilan halaman masuk yang diatur Developer, plus status selesai dimuat. */
export function useBrandingRecord() {
  const [branding, setBranding] = useState<Branding>(() =>
    withAutoVersion(defaultBranding),
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cached = readCache();
    if (cached) setBranding(withAutoVersion({ ...defaultBranding, ...cached }));
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("app_branding")
        .select(COLUMNS)
        .eq("id", "default")
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const row = withAutoVersion({ ...defaultBranding, ...(data as Branding) });
        setBranding(row);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(row));
        } catch {
          /* penyimpanan penuh */
        }
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const receive = (event: Event) => {
      const customEvent = event as CustomEvent<Branding>;
      setBranding(withAutoVersion({ ...defaultBranding, ...customEvent.detail }));
      setLoaded(true);
    };
    window.addEventListener(BRANDING_EVENT, receive);
    return () => window.removeEventListener(BRANDING_EVENT, receive);
  }, []);

  return { branding, loaded };
}

/** Tampilan halaman masuk yang diatur Developer dari pusat kontrol. */
export function useBranding() {
  return useBrandingRecord().branding;
}
