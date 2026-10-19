import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBilling, type ConsoleType, type StationAvailability } from "@/lib/billing-store";
import { SetupHeading, SetupTable, DetailField } from "@/components/SetupTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StationTvSettings } from "@/components/StationTvSettings";
import { tvIps } from "@/lib/tv-notify";
import { TvNotifySettings } from "@/components/TvNotifySettings";

const STATION_STATUS_LABEL: Record<StationAvailability, string> = {
  available: "Tersedia",
  booked: "Reservasi",
  maintenance: "Maintenance",
  offline: "Offline",
};

export const Route = createFileRoute("/_authenticated/station")({
  head: () => ({
    meta: [
      { title: "Setup Station — RenToPlay" },
      { name: "description", content: "Kelola daftar station, IP layar, dan notifikasi pengingat waktu bermain." },
      { property: "og:title", content: "Setup Station — RenToPlay" },
      { property: "og:description", content: "Atur station, IP layar, serta pesan dan waktu pengingat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StationPage,
});

function StationPage() {
  const { stations, addStation, setStationConsole, removeStation, updateStation, reorderList, consoleTypes, businessProfile } =
    useBilling();
  const [ips, setIps] = useState<Record<string, string>>({});
  useEffect(() => { setIps(tvIps()); }, []);
  const [name, setName] = useState("");
  const [booth, setBooth] = useState("");
  const [consoleType, setConsoleType] = useState<ConsoleType>(consoleTypes[0] ?? "PS4");

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Setup Station</h1>
      </header>
      <Tabs defaultValue="stations">
        <TabsList className="setup-tabs-list"><TabsTrigger value="stations">Daftar Station</TabsTrigger><TabsTrigger value="add">Tambah Station</TabsTrigger>{businessProfile?.modules?.tvConnect !== false && <TabsTrigger value="tv">Pengaturan TV</TabsTrigger>}</TabsList>
      <TabsContent value="add">
      <section className="setup-section">
        <h2 className="text-xl font-semibold">Tambah Station</h2>
        <form
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Nama station wajib diisi");
              return;
            }
            addStation({ name, booth, console: consoleType });
            setName("");
            setBooth("");
            toast.success("Unit ditambahkan");
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="unit-name">Nama Station</Label>
            <Input
              id="unit-name"
              placeholder="Station 07"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit-booth">Room / Booth</Label>
            <Input
              id="unit-booth"
              placeholder="VIP 3"
              value={booth}
              onChange={(e) => setBooth(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit-console">Konsol</Label>
            <Select
              value={consoleType}
              onValueChange={(v) => setConsoleType(v as ConsoleType)}
            >
              <SelectTrigger id="unit-console">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {consoleTypes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="self-end">
            <Plus className="size-4" /> Tambah
          </Button>
        </form>
      </section>

      </TabsContent>
      <TabsContent value="stations">
      <section className="setup-section">
        <SetupHeading
          title={`Daftar Station (${stations.length})`}
          right={<Tv className="size-5 text-primary" />}
        />
        <SetupTable
          items={stations}
          getId={(s) => s.id}
          getLabel={(s) => s.name}
          onReorder={(activeId, overId) => reorderList("stations", activeId, overId)}
          columns={[
            {
              key: "name",
              header: "Station",
              sortValue: (s) => s.name.toLowerCase(),
              render: (s) => <span className="font-bold text-foreground">{s.name}</span>,
            },
            {
              key: "booth",
              header: "Room",
              hideOnMobile: true,
              sortValue: (s) => (s.booth || "").toLowerCase(),
              render: (s) => s.booth || "—",
            },
            {
              key: "console",
              header: "Konsol",
              sortValue: (s) => s.console.toLowerCase(),
              render: (s) => s.console,
            },
            ...(businessProfile?.modules?.tvConnect !== false ? [{ key: "ip", header: "IP Layar TV", render: (s: { id: string }) => <span className={ips[s.id] ? "font-mono text-foreground" : "text-muted-foreground"}>{ips[s.id] || "Belum diisi"}</span> }] : []),
            {
              key: "status",
              header: "Status",
              hideOnMobile: true,
              sortValue: (s) =>
                s.session ? "0 Dipakai" : `1 ${STATION_STATUS_LABEL[s.availability]}`,
              render: (s) =>
                s.session ? (
                  <span className="font-semibold text-accent">Dipakai</span>
                ) : (
                  STATION_STATUS_LABEL[s.availability]
                ),
            },
          ]}
          onRemove={(s) => {
            if (s.session) {
              toast.error(`${s.name} sedang dipakai`);
              return;
            }
            removeStation(s.id);
            toast.success(`${s.name} dihapus`);
          }}
          detailTitle={(s) => `Station ${s.name}`}
          detailDescription={() => "Identitas Station dan koneksi layar TV."}
          renderDetail={(s) => (
            <Tabs defaultValue="unit">
              <TabsList className="setup-tabs-list"><TabsTrigger value="unit">Identitas Station</TabsTrigger>{businessProfile?.modules?.tvConnect !== false && <TabsTrigger value="screen">Layar TV</TabsTrigger>}</TabsList>
              <TabsContent value="unit" className="space-y-4">
              <DetailField label="Station">
                <Input
                  value={s.name}
                  onChange={(e) => updateStation(s.id, { name: e.target.value })}
                  aria-label={`Nama ${s.name}`}
                />
              </DetailField>
              <DetailField label="Room / Booth">
                <Input
                  value={s.booth}
                  onChange={(e) => updateStation(s.id, { booth: e.target.value })}
                  aria-label={`Room ${s.name}`}
                />
              </DetailField>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Konsol">
                  <Select
                    value={s.console}
                    onValueChange={(v) => setStationConsole(s.id, v as ConsoleType)}
                  >
                    <SelectTrigger aria-label={`Konsol ${s.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {consoleTypes.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DetailField>
                <DetailField label="Status">
                  <Select
                    value={s.availability}
                    disabled={Boolean(s.session)}
                    onValueChange={(v) =>
                      updateStation(s.id, { availability: v as StationAvailability })
                    }
                  >
                    <SelectTrigger aria-label={`Status ${s.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Tersedia</SelectItem>
                      <SelectItem value="booked">Reservasi</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </DetailField>
              </div>
              </TabsContent>
              {businessProfile?.modules?.tvConnect !== false && <TabsContent value="screen"><StationTvSettings stationId={s.id} name={s.name} onIpChange={() => setIps(tvIps())} /></TabsContent>}
            </Tabs>
          )}
        />
      </section>
      </TabsContent>
      {businessProfile?.modules?.tvConnect !== false && (
      <TabsContent value="tv"><section className="setup-section">
        <TvNotifySettings />
      </section></TabsContent>
      )}
      </Tabs>
    </div>
  );
}
