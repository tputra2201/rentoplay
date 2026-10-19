import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeName = "putih" | "gelap" | "terang" | "berwarna" | "cosmo";

const STORAGE_KEY = "billing-theme-v1";

export const themeOptions: { value: ThemeName; label: string; hint: string }[] = [
  { value: "putih", label: "Putih", hint: "Latar putih bersih dengan batas panel dan kolom yang tegas" },
  { value: "gelap", label: "Gelap", hint: "Latar gelap, nyaman untuk ruangan redup" },
  { value: "terang", label: "Kuning", hint: "Latar kuning lembut, hangat dan tidak menyilaukan" },
  { value: "berwarna", label: "Berwarna", hint: "Latar biru Chelsea dengan aksen emas" },
  { value: "cosmo", label: "Cosmo", hint: "Ungu pekat dengan aksen oranye dan magenta" },
];

const classFor: Record<ThemeName, string> = {
  putih: "theme-putih",
  gelap: "dark theme-gelap",
  terang: "theme-terang",
  berwarna: "theme-berwarna",
  cosmo: "dark theme-cosmo",
};

type Ctx = { theme: ThemeName; setTheme: (t: ThemeName) => void };
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>("gelap");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeName | null;
    if (saved && saved in classFor) setTheme(saved);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.className = classFor[theme];
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* penyimpanan penuh — abaikan */
    }
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme harus dipakai di dalam ThemeProvider");
  return ctx;
}
