import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useBilling } from "@/lib/billing-store";
const EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
  "click",
  "visibilitychange",
] as const;

export function IdleLogout() {
  const { session, signOut } = useAuth();
  const { sessionSecurity } = useBilling();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exempt = pathname.startsWith("/auth");
  // Menit idle diatur di Setup → Store. 0 berarti keluar otomatis dimatikan.
  const idleMs = Math.max(0, Math.round(sessionSecurity.idleMinutes)) * 60 * 1000;

  useEffect(() => {
    if (!session || exempt || idleMs <= 0) return;

    const logout = async () => {
      // Saat internet mati, masuk kembali tidak mungkin dilakukan. Jangan
      // keluarkan kasir: tunda sampai koneksi kembali.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        reset();
        return;
      }
      toast.info("Keluar otomatis", {
        description: `Tidak ada aktivitas selama ${sessionSecurity.idleMinutes} menit. Timer rental tetap berjalan.`,
      });
      await signOut();
      navigate({ to: "/auth", replace: true });
    };

    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void logout(), idleMs);
    };

    reset();
    for (const ev of EVENTS) window.addEventListener(ev, reset, { passive: true });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const ev of EVENTS) window.removeEventListener(ev, reset);
    };
  }, [session, exempt, idleMs, sessionSecurity.idleMinutes, navigate, signOut]);

  return null;
}
