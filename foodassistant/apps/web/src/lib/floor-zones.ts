export const FLOOR_ZONE_PRESETS = [
  { id: "hall", label: "Зал" },
  { id: "terrace", label: "Терраса" },
  { id: "street", label: "Улица" },
  { id: "garden", label: "Сад" },
  { id: "bar", label: "Бар" },
] as const;

export type FloorZoneId = (typeof FLOOR_ZONE_PRESETS)[number]["id"] | string;

export function zoneLabel(zone?: string | null): string {
  const id = (zone || "hall").toLowerCase();
  const preset = FLOOR_ZONE_PRESETS.find((z) => z.id === id);
  if (preset) return preset.label;
  if (!id) return "Зал";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function normalizeZone(zone?: string | null): string {
  const raw = (zone || "hall").trim().toLowerCase();
  if (!raw) return "hall";
  const aliases: Record<string, string> = {
    зал: "hall",
    hall: "hall",
    indoor: "hall",
    main: "hall",
    улица: "street",
    street: "street",
    outside: "street",
    терраса: "terrace",
    terrace: "terrace",
    patio: "terrace",
    веранда: "terrace",
    сад: "garden",
    garden: "garden",
    бар: "bar",
    bar: "bar",
  };
  return aliases[raw] || raw.replace(/[^a-z0-9_-]/g, "") || "hall";
}

export function listZonesFromTables<T extends { zone?: string | null }>(
  tables: T[],
): string[] {
  const order: string[] = FLOOR_ZONE_PRESETS.map((z) => z.id);
  const seen = new Set<string>();
  for (const t of tables) {
    seen.add(normalizeZone(t.zone));
  }
  if (seen.size === 0) seen.add("hall");
  const ordered = order.filter((id) => seen.has(id));
  const custom = [...seen].filter((id) => !order.includes(id)).sort();
  return [...ordered, ...custom];
}
