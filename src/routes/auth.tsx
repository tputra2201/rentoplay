import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Joystick, LockKeyhole, LogIn, MailQuestion } from "lucide-react";
import { passwordSetupUrl } from "@/lib/app-url";
import { isAuthConnectionError } from "@/lib/auth-errors";
import { deviceCode, takeDeviceReject, type DeviceReject } from "@/lib/device-guard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk Akun — RenToPlay" },
      {
        name: "description",
        content:
          "Masuk dengan akun staf yang sudah didaftarkan Admin untuk mengelola RenToPlay.",
      },
      { property: "og:title", content: "Masuk Akun — RenToPlay" },
      {
        property: "og:description",
        content: "Halaman login staf untuk aplikasi RenToPlay.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [devSecret, setDevSecret] = useState("");
  const [devBusy, setDevBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [myCode, setMyCode] = useState("");
  const [myIp, setMyIp] = useState("");
  const [rejected, setRejected] = useState<DeviceReject | null>(null);

  useEffect(() => {
    setMyCode(deviceCode());
    setRejected(takeDeviceReject());
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/public/client-ip");
        if (!res.ok) return;
        const body = (await res.json()) as { ip?: string };
        if (!cancelled) setMyIp(body.ip ?? "");
      } catch {
        /* luring */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} disalin`);
    } catch {
      toast.error(`Tidak bisa menyalin ${label.toLowerCase()}`);
    }
  };

  const sendReset = async () => {
    if (!email.trim()) {
      toast.error("Isi email akun dulu, lalu tekan Lupa password");
      return;
    }
    setResetBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordSetupUrl(),
      });
      if (error) throw error;
      toast.success(`Tautan atur ulang sandi dikirim ke ${email.trim()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        /database error|unexpected/i.test(msg) || !msg
          ? "Tautan atur ulang sandi gagal dibuat. Coba lagi sebentar lagi atau hubungi Manager."
          : msg,
      );
    } finally {
      setResetBusy(false);
    }
  };

  const openControlCenter = async () => {
    if (!devSecret) return;
    setDevBusy(true);
    try {
      const res = await fetch("/api/public/store-registry", {
        headers: { "x-control-secret": devSecret },
      });
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).trim();
        toast.error(text || `Gagal membuka pusat kontrol (kode ${res.status}).`, {
          duration: 12000,
        });
        return;
      }
      sessionStorage.setItem("rentalpro-control-secret", devSecret);
      setDevOpen(false);
      setDevSecret("");
      navigate({ to: "/kontrol" });

    } catch {
      toast.error("Tidak bisa terhubung ke pusat kontrol.");
    } finally {
      setDevBusy(false);
    }
  };

  useEffect(() => {
    // INITIAL_SESSION also handles users who are already signed in.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Berhasil masuk");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan";
      toast.error(
        isAuthConnectionError(err)
          ? "Tidak dapat terhubung. Periksa koneksi internet, lalu coba masuk kembali."
          : message.includes("Invalid login credentials")
          ? "Email atau kata sandi salah"
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center">
      <div className="surface-panel p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => setDevOpen(true)}
            aria-label="Buka akses lanjutan"

            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt={branding.login_title || "Logo aplikasi"}
                className="size-20 rounded-xl object-contain"
              />
            ) : (
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary glow-primary">
                <Joystick className="size-6" />
              </span>
            )}
          </button>
          {branding.login_title.trim() && (
            <h1 className="mt-4 font-display text-2xl font-bold text-neon">
              {branding.login_title}
            </h1>
          )}
        </div>

        {rejected !== null && (
          <div className="mt-6 grid gap-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <p className="font-bold">Perangkat ini belum terdaftar.</p>
            <p>
              Store yang menolak:{" "}
              <span className="font-bold">{rejected.storeName || "tidak diketahui"}</span>
            </p>
            <p>
              Kode perangkat:{" "}
              <span className="font-mono font-bold">{rejected.code || myCode || "-"}</span>
            </p>
            <p>
              Alamat IP internet:{" "}
              <span className="font-mono font-bold">
                {rejected.ip || myIp || "tidak diketahui"}
              </span>
            </p>
            <p className="text-xs">
              Minta Manager atau Installer mendaftarkan kode perangkat ini di Setup →
              Store → Perangkat yang Diizinkan.
            </p>
          </div>
        )}

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Kata sandi</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kata sandi dari Admin"
              minLength={6}
              required
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            <LogIn className="size-4" /> Masuk
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={resetBusy}
            onClick={() => void sendReset()}
          >
            <MailQuestion className="size-4" /> Lupa password
          </Button>
        </form>

        <div className="mt-6 grid gap-1 rounded-lg border border-border p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>
              Kode perangkat:{" "}
              <span className="font-mono font-bold text-foreground">{myCode || "-"}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void copy(myCode, "Kode perangkat")}
            >
              <Copy className="size-3.5" /> Salin
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>
              Alamat IP internet:{" "}
              <span className="font-mono font-bold text-foreground">
                {myIp || "tidak diketahui"}
              </span>
            </span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={!myIp}
              onClick={() => void copy(myIp, "Alamat IP")}
            >
              <Copy className="size-3.5" /> Salin
            </Button>
          </div>
        </div>

        {branding.login_note.trim() && (
          <p className="mt-6 whitespace-pre-line text-center text-xs text-muted-foreground">
            {branding.login_note}
          </p>
        )}

      </div>

      <Dialog open={devOpen} onOpenChange={setDevOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockKeyhole className="size-4" /> Akses Developer
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="dev-secret">Kunci Developer</Label>
            <Input
              id="dev-secret"
              type="password"
              value={devSecret}
              onChange={(e) => setDevSecret(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void openControlCenter();
              }}
              placeholder="••••••••"
            />
          </div>
          <Button disabled={!devSecret || devBusy} onClick={() => void openControlCenter()}>
            <LockKeyhole className="size-4" /> Buka pusat kontrol
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
