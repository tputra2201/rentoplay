import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, MailQuestion } from "lucide-react";
import { passwordSetupUrl } from "@/lib/app-url";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, roleLabel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/akun")({
  head: () => ({
    meta: [
      { title: "Akun Saya — RenToPlay" },
      {
        name: "description",
        content: "Ubah kata sandi akun staf pada aplikasi RenToPlay.",
      },
      { property: "og:title", content: "Akun Saya — RenToPlay" },
      {
        property: "og:description",
        content: "Halaman ganti kata sandi untuk staf rental PlayStation.",
      },
    ],
  }),
  component: AkunPage,
});

function AkunPage() {
  const { user, fullName, role } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const sendReset = async () => {
    const email = user?.email;
    if (!email) {
      toast.error("Email akun tidak ditemukan");
      return;
    }
    setResetBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: passwordSetupUrl(),
      });
      if (error) throw error;
      toast.success(`Tautan atur ulang sandi dikirim ke ${email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim tautan");
    } finally {
      setResetBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("Konfirmasi kata sandi tidak sama");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: next,
        current_password: current,
      } as { password: string; current_password: string });
      if (error) throw error;
      toast.success("Kata sandi berhasil diubah");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah kata sandi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="font-display text-2xl font-bold text-neon">Password</h1>

      <form className="surface-panel mt-6 grid gap-4 p-6" onSubmit={submit}>
        <div className="grid gap-2">
          <Label htmlFor="current">Kata sandi saat ini</Label>
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="next">Kata sandi baru</Label>
          <Input
            id="next"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirm">Ulangi kata sandi baru</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={busy}>
          <KeyRound className="size-4" /> Simpan kata sandi
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={resetBusy}
          onClick={() => void sendReset()}
        >
          <MailQuestion className="size-4" /> Lupa password
        </Button>
      </form>
    </div>
  );
}
