const tones = ["blue", "pink", "mint", "amber", "lilac", "cyan"] as const;
export type StationTone = typeof tones[number];
export function stationGroup(name: string): string {
  return name.trim().match(/^([^0-9]+?)\s*[-_]?\s*\d+$/)?.[1]?.trim().toUpperCase() ?? "";
}
export function stationTones(stations: { id: string; name: string }[]): Record<string, StationTone> {
  const groups = [...new Set(stations.map(s => stationGroup(s.name)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
  return Object.fromEntries(stations.map((s, i) => {
    const group = stationGroup(s.name);
    const index = group ? groups.indexOf(group) : Math.floor(i / 6);
    return [s.id, tones[index % tones.length] ?? "blue"];
  }));
}
