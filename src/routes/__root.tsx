import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import {
  LayoutGrid,
  MonitorPlay,
  Tv,
  Settings2,
  BarChart3,
  Joystick,
  Coffee,
  Coins,
  CreditCard,

  Wallet,
  DatabaseBackup,
  Menu,
  CalendarDays,
  Users,
  Percent,
  LogOut,
  UserCog,
  KeyRound,
  Store,
  Printer,
  Wifi,
  WifiOff,
  RefreshCw,
  ClipboardCheck,
  Wrench,
  ChevronDown,

  Palette,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { BillingProvider, useBilling } from "@/lib/billing-store";
import { AuthProvider, useAuth, roleLabel } from "@/lib/auth";
import { can, MENU_PERMISSION } from "@/lib/permissions";
import { Toaster } from "../components/ui/sonner";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { ForcePasswordChange } from "@/components/ForcePasswordChange";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { ReservationAlert } from "@/components/ReservationAlert";
import { IdleLogout } from "@/components/IdleLogout";
import { TimeUpAlarm } from "@/components/TimeUpAlarm";
import { DeviceNotifyWatcher } from "@/components/DeviceNotifyWatcher";
import { InstallAppTitle } from "@/components/InstallAppTitle";
import { AppUpdater } from "@/components/AppUpdater";
import { appSignature } from "@/lib/app-info";
import { brandingSignature, useBranding } from "@/lib/branding";
import { useStoreInfo } from "@/lib/store-info";
import { DeviceGuardProvider } from "@/lib/device-guard";
import { DeviceGate } from "@/components/DeviceGate";
import { useDeveloper } from "@/lib/developer";
import { DeveloperStoreSwitcher } from "@/components/DeveloperStoreSwitcher";
import { ThemeProvider } from "@/lib/theme";



function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Halaman tidak ditemukan
        </h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: import("@tanstack/react-router").ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Halaman gagal dimuat
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Terjadi kesalahan. Coba muat ulang halaman.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Coba lagi
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "RenToPlay" },
      {
        name: "description",
        content:
          "Aplikasi kasir dan timer rental PlayStation: monitor TV, tarif, dan laporan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#060f1e" },
      { name: "apple-mobile-web-app-title", content: "RenToPlay" },
    ],
    links: [
      { rel: "manifest", href: "/api/public/manifest" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },

      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className="dark theme-gelap">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutGrid },
  { to: "/shift", label: "Kasir", icon: ClipboardCheck },
  { to: "/payinout", label: "Finance", icon: Coins },
  { to: "/booking", label: "Reservasi", icon: CalendarDays },
  { to: "/kartu", label: "Playing Card", icon: CreditCard },
  { to: "/laporan", label: "Reports", icon: BarChart3 },
  { to: "/backup", label: "Backup", icon: DatabaseBackup },
] as const;

const setupItems = [
  { to: "/tarif", label: "Pricing", icon: Settings2 },
  { to: "/station", label: "Station", icon: Tv },
  { to: "/pelanggan", label: "Membership", icon: Users },
  { to: "/kafe", label: "Kafe", icon: Coffee },
  { to: "/promo", label: "Promo", icon: Percent },
  { to: "/pembayaran", label: "Payment", icon: Wallet },
  { to: "/kas", label: "Finance", icon: Coins },
  { to: "/pengguna", label: "User", icon: UserCog },
  { to: "/printer", label: "Printer", icon: Printer },
  { to: "/tv", label: "TV Connect", icon: MonitorPlay },
  { to: "/akun", label: "Password", icon: KeyRound },
  { to: "/tema", label: "Tema", icon: Palette },
  { to: "/store", label: "Store", icon: Store },
] as const;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <DeviceGuardProvider>
          <BillingProvider>
            <AppShell />
            <DeviceGate />
            <PresenceHeartbeat />
            <ReservationAlert />
            <TimeUpAlarm />
            <DeviceNotifyWatcher />
            <AppUpdater />
            <IdleLogout />
            <AndroidPrintFeedback />
            <InstallAppTitle />
            <Toaster position="top-right" richColors />
          </BillingProvider>
          </DeviceGuardProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>

  );
}

function AndroidPrintFeedback() {
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ ok?: boolean; message?: string }>).detail;
      const message = detail?.message || (detail?.ok ? "Cetak berhasil" : "Cetak gagal");
      if (detail?.ok) toast.success(message);
      else toast.error(message);
    };
    window.addEventListener("billing-android-print", handle);
    return () => window.removeEventListener("billing-android-print", handle);
  }, []);
  return null;
}

function AppShell() {
  const { session, role, fullName, user, signOut, mustChangePassword } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isTvPage = pathname === "/tv";
  const isPasswordSetupPage = pathname === "/atur-sandi";
  const isAuthPage = pathname === "/auth" || isPasswordSetupPage || isTvPage;
  const [menuOpen, setMenuOpen] = useState(false);
  const { store } = useStoreInfo(Boolean(session));
  const developer = useDeveloper(Boolean(session));
  const branding = useBranding();
  const { sync, shifts, rolePermissions, businessProfile } = useBilling();
  const needCheckIn = {
    done: shifts.some((s) => !s.closedAt) || pathname === "/shift",
  };

  const storeName = store?.store_name?.trim() ?? "";
  const brandSignature = brandingSignature(branding);
  const signature =
    brandSignature || appSignature(store?.app_version, store?.dev_contact);
  const expiresAt = store?.expires_at ?? null;

  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const msLeft = expiryDate ? expiryDate.getTime() - Date.now() : null;
  const daysLeft =
    msLeft === null ? null : Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  const expired = msLeft !== null && msLeft <= 0 && !developer.isDeveloper;
  const expiryLabel = expiryDate
    ? expiryDate.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";



  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Tautan undangan / pemulihan sandi kadang mendarat di halaman lain.
  // Arahkan ke halaman buat kata sandi agar tidak langsung masuk Dashboard.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname === "/atur-sandi") return;
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const type = search.get("type") ?? hash.get("type");
    const hasCode = Boolean(search.get("code") ?? hash.get("access_token"));
    if (hasCode || type === "invite" || type === "recovery" || type === "signup") {
      navigate({
        to: "/atur-sandi",
        search: Object.fromEntries(search.entries()),
        replace: true,
      });
    }
  }, [pathname, navigate]);

  const allowed = (path: string) => {
    const mods = businessProfile.modules;
    if (path === "/kafe" && !mods.cafe) return false;
    if (path === "/booking" && !mods.booking) return false;
    if (path === "/kartu" && !mods.playingCard) return false;
    if ((path === "/tarif" || path === "/station") && mods.rental === false) return false;
    if ((path === "/payinout" || path === "/kas") && mods.finance === false) return false;
    if (path === "/tv" && mods.tvConnect === false) return false;
    const key = MENU_PERMISSION[path];
    if (!key) return true;
    return can(role, key, rolePermissions);
  };
  const items = navItems.filter(({ to }) => allowed(to));
  const setups = setupItems.filter(({ to }) => allowed(to));
  const blocked = session !== null && role !== null && !allowed(pathname);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen">
      {!isAuthPage && (
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <Link to={session ? "/" : "/auth"} className="flex items-center gap-2.5">
            {branding.app_icon_url.trim() || store?.logo_url ? (
              <img
                src={branding.app_icon_url.trim() || store?.logo_url}
                alt={branding.app_name.trim() ? `Ikon ${branding.app_name.trim()}` : "Ikon aplikasi"}
                className="size-9 shrink-0 rounded-lg object-contain"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary glow-primary">
                <Joystick className="size-5" />
              </span>
            )}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-display text-lg font-bold tracking-wide text-neon">
                {branding.app_name.trim() || storeName || "BILLING RENTAL PS"}
              </span>

              {session && storeName && (
                <span className="truncate text-xs font-semibold text-foreground">
                  {storeName}
                </span>
              )}

              <span className="truncate font-mono text-[11px] tracking-wide text-muted-foreground">
                {signature}
              </span>
            </span>

          </Link>
          {session && !isAuthPage && (
            <>
              <div className="flex items-center gap-2">
                <DeveloperStoreSwitcher enabled={Boolean(session)} />
                <button
                  type="button"
                  onClick={() => sync.resyncNow()}
                  title={
                    sync.online
                      ? sync.pending > 0
                        ? `${sync.pending} perubahan menunggu terkirim — tekan untuk menyegarkan data`
                        : "Data tersimpan di pusat — tekan untuk menyegarkan data"
                      : "Mode luring — data disimpan di perangkat dan dikirim otomatis saat internet kembali"
                  }
                  className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:brightness-110 sm:inline-flex ${
                    sync.online
                      ? sync.pending > 0
                        ? "border-warning/50 bg-warning/10 text-warning"
                        : "border-success/50 bg-success/10 text-success"
                      : "border-destructive/50 bg-destructive/10 text-destructive"
                  }`}
                >
                  {sync.online ? (sync.syncing || sync.pending > 0 ? <RefreshCw className="size-3 animate-spin" /> : <Wifi className="size-3" />) : <WifiOff className="size-3" />}
                  {sync.online
                    ? sync.pending > 0
                      ? `Mengirim ${sync.pending}`
                      : sync.syncing
                        ? "Menyegarkan"
                        : "Tersinkron"
                    : "Mode luring"}
                </button>

                <div className="min-w-0 max-w-[9rem] text-right sm:max-w-none">
                  <p className="truncate text-sm font-medium leading-tight">
                    {fullName || user?.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {role ? roleLabel[role] : "Memuat…"}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Keluar"
                  onClick={handleSignOut}
                >
                  <LogOut className="size-4" />
                </Button>
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="md:hidden"
                      aria-label="Buka menu"
                    >
                      <Menu className="size-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="right"
                    className="flex w-[min(20rem,88vw)] flex-col gap-0 p-4"
                  >
                    <SheetTitle className="text-base">Menu Operasional</SheetTitle>
                    <nav className="mt-3 grid grid-cols-2 gap-1.5">
                      {items.map(({ to, label, icon: Icon }) => (
                        <Link
                          key={to}
                          to={to}
                          activeOptions={{ exact: to === "/" }}
                          onClick={() => setMenuOpen(false)}
                          className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-secondary/25 px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          activeProps={{
                            className:
                              "bg-secondary text-primary border-primary/50 glow-primary",
                          }}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="truncate">{label}</span>
                        </Link>
                      ))}
                    </nav>
                    {setups.length > 0 && (
                      <>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Setup
                        </p>
                        <nav className="mt-2 grid grid-cols-2 gap-1.5">
                          {setups.map(({ to, label, icon: Icon }) => (
                            <Link
                              key={to}
                              to={to}
                              onClick={() => setMenuOpen(false)}
                              className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-secondary/25 px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                              activeProps={{
                                className:
                                  "bg-secondary text-primary border-primary/50 glow-primary",
                              }}
                            >
                              <Icon className="size-4 shrink-0" />
                              <span className="truncate">{label === "TV Connect" ? `${businessProfile.unitLabel || "TV"} Connect` : label}</span>
                            </Link>
                          ))}
                        </nav>
                      </>
                    )}
                  </SheetContent>
                </Sheet>
              </div>
            </>
          )}
          </div>
          {session && !isAuthPage && (
            <nav className="hidden flex-wrap items-center justify-center gap-x-1 gap-y-1.5 border-t border-border/60 pt-2 md:flex">
              {items.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: to === "/" }}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:px-3 lg:py-2 lg:text-sm"
                  activeProps={{ className: "bg-secondary text-primary" }}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </Link>
              ))}
              {setups.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:px-3 lg:py-2 lg:text-sm">
                      <Wrench className="size-4 shrink-0" />
                      Setup
                      <ChevronDown className="size-3.5 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {setups.map(({ to, label, icon: Icon }) => (
                      <DropdownMenuItem key={to} asChild>
                        <Link to={to} className="flex items-center gap-2">
                          <Icon className="size-4 shrink-0" />
                          {label === "TV Connect" ? `${businessProfile.unitLabel || "TV"} Connect` : label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </nav>
          )}
        </div>

      </header>
      )}
      <main
        className={
          isTvPage ? "min-h-screen" : "mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8"
        }
      >
        {session && !isAuthPage && expired ? (
          <div className="surface-panel mx-auto max-w-lg border-destructive/60 p-8 text-center">
            <h1 className="blink-warning font-display text-2xl font-bold text-destructive">
              Masa aktif aplikasi telah berakhir
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Aplikasi berakhir pada {expiryLabel} dan tidak dapat digunakan
              untuk sementara. Silakan hubungi Developer untuk memperpanjang
              masa aktif.
            </p>
            <p className="mt-4 font-mono text-xs text-muted-foreground">
              {signature}
            </p>
            <Button variant="outline" className="mt-6" onClick={handleSignOut}>
              Keluar
            </Button>
          </div>
        ) : (
          <>
            {session && !isAuthPage && daysLeft !== null && daysLeft <= 10 && (
              <div className="blink-warning mb-6 rounded-lg border border-warning/60 bg-warning/10 px-4 py-3 text-center text-sm font-semibold text-warning">
                Masa aktif aplikasi berakhir dalam {daysLeft} hari ({expiryLabel}
                ). Segera hubungi Developer untuk perpanjangan.
              </div>
            )}
            {session && !isAuthPage && !needCheckIn.done && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/60 bg-warning/10 px-4 py-3 text-sm font-semibold text-warning">
                <span>Belum check-in shift kasir. Lakukan check-in dulu sebelum bertugas.</span>
                <Button size="sm" variant="outline" onClick={() => navigate({ to: "/shift" })}>
                  Check-in sekarang
                </Button>
              </div>
            )}

            {blocked ? (
              <div className="surface-panel mx-auto max-w-md p-8 text-center">
                <h1 className="text-xl font-semibold">Akses terbatas</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Level {role ? roleLabel[role] : ""} belum punya hak akses ke
                  halaman ini. Silakan hubungi Installer atau Manager.
                </p>
                <Button className="mt-6" onClick={() => navigate({ to: "/" })}>
                  Kembali ke Dashboard
                </Button>
              </div>
            ) : (
              <Outlet />
            )}
          </>
        )}
      </main>

      {session && !isAuthPage && mustChangePassword && <ForcePasswordChange />}
    </div>
  );
}

