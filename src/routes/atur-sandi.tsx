import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { setOwnPassword as setOwnPasswordFn } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


export const Route = createFileRoute("/atur-sandi")({
  
  head: () => ({
    meta: [
      { title: "Buat Kata Sandi — RenToPlay" },
      {
        name: "description",
        content:
          "Buat kata sandi sendiri lewat tautan undangan dari Admin untuk mulai memakai aplikasi RenToPlay.",
      },
      { property: "og:title", content: "Buat Kata Sandi — RenToPlay" },
      {
        property: "og:description",
        content: "Halaman pembuatan kata sandi bagi staf yang diundang Admin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AturSandiPage,
});

function AturSandiPage() {
  const navigate = useNavigate();
  const savePassword = useServerFn(setOwnPasswordFn);

  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      setValid(ok);
      setReady(true);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) finish(true);
    });

    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          finish(true);
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) finish(true);
      else setTimeout(() => finish(false), 1200);
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("Kata sandi minimal 8 karakter");
      return;
    }
    if (next !== confirm) {
      toast.error("Konfirmasi kata sandi tidak sama");
      return;
    }
    setBusy(true);
    try {
      await savePassword({ data: { password: next } });
      await supabase.auth.signOut();

      toast.success("Kata sandi tersimpan. Silakan masuk dengan sandi baru.");
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan kata sandi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
      <div className="surface-panel p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary glow-primary">
            <ShieldCheck className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-neon">
            BUAT KATA SANDI
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tentukan kata sandi milikmu sendiri untuk masuk ke aplikasi.
          </p>
        </div>

        {!ready && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Memeriksa tautan undangan…
          </p>
        )}

        {ready && !valid && (
          <div className="mt-6 grid gap-3 text-center">
            <p className="text-sm text-destructive">
              Tautan undangan tidak berlaku atau sudah kedaluwarsa.
            </p>
            <p className="text-xs text-muted-foreground">
              Minta Admin mengirim ulang undangan lewat menu Pengguna.
            </p>
            <Button variant="outline" onClick={() => navigate({ to: "/auth" })}>
              Kembali ke halaman masuk
            </Button>
          </div>
        )}

        {ready && valid && (
          <form className="mt-6 grid gap-4" onSubmit={submit}>
            <div className="grid gap-2">
              <Label htmlFor="new">Kata sandi baru</Label>
              <div className="relative">
                <Input
                  id="new"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm">Ulangi kata sandi</Label>
              <Input
                id="confirm"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Ketik ulang kata sandi"
                required
              />
              {mismatch && (
                <p className="text-xs text-destructive">Kata sandi belum sama persis.</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy || mismatch}>
              <KeyRound className="size-4" /> Simpan & masuk
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
