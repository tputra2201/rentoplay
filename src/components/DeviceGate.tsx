import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setDeviceReject, useDeviceAccess } from "@/lib/device-guard";
import { useBilling } from "@/lib/billing-store";

/**
 * Perangkat yang tidak terdaftar di data store tidak boleh masuk sama sekali,
 * kecuali levelnya Manager, Installer, atau Developer. Halaman masuk
 * dibiarkan apa adanya.
 *
 * Penolakan hanya dilakukan bila data store benar-benar sudah terbaca dari
 * server dan level pengguna sudah diketahui, supaya tidak ada yang terlempar
 * hanya karena datanya belum selesai dimuat.
 */
export function DeviceGate() {
  const { checked, roleReady, allowed, privileged, code, ip, storeName } = useDeviceAccess();
  const { addLog } = useBilling();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const kicking = useRef(false);

  useEffect(() => {
    if (
      pathname.startsWith("/auth") ||
      pathname.startsWith("/atur-sandi")
    )
      return;
    if (!checked || !roleReady || allowed || privileged || kicking.current) return;
    kicking.current = true;
    void (async () => {
      setDeviceReject({ code, ip, storeName });
      addLog(
        "Perangkat ditolak masuk",
        `Kode perangkat: ${code || "-"} · IP: ${ip || "tidak diketahui"} · Store: ${
          storeName || "-"
        }`,
      );
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
      kicking.current = false;
    })();
  }, [
    checked,
    roleReady,
    allowed,
    privileged,
    code,
    ip,
    storeName,
    pathname,
    navigate,
    queryClient,
    addLog,
  ]);

  return null;
}
