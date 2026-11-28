import type { Table } from "@/lib/api";
import { normalizeZone } from "@/lib/floor-zones";

/** Zone order on the plan (first zone tab first), then table number. */
function byZoneThenNumber(zones: string[]) {
  return (a: Table, b: Table) =>
    zones.indexOf(normalizeZone(a.zone)) - zones.indexOf(normalizeZone(b.zone)) || a.number - b.number;
}

/**
 * The table the floor plan opens on: the first free one (first zone, lowest number),
 * else simply the first table, so the inspector never starts empty.
 */
export function defaultTable(tables: Table[], zones: string[], minSeats = 0): Table | null {
  const sorted = [...tables].sort(byZoneThenNumber(zones));
  const fitting = sorted.filter((table) => table.seats >= minSeats);
  return fitting.find((table) => table.status === "FREE") ?? fitting[0] ?? sorted[0] ?? null;
}

/** First table to select in a zone (after a zone switch or a seats filter). */
export function firstInZone(tables: Table[], zone: string, minSeats = 0): Table | null {
  const inZone = tables
    .filter((table) => normalizeZone(table.zone) === zone && table.seats >= minSeats)
    .sort((a, b) => a.number - b.number);
  return inZone.find((table) => table.status === "FREE") ?? inZone[0] ?? null;
}

/**
 * Free tables a guest at a busy table can switch to right now: enough seats first,
 * closest size, same zone, then number.
 */
export function similarFreeTables(tables: Table[], busy: Table): Table[] {
  const zone = normalizeZone(busy.zone);
  return tables
    .filter((table) => table.id !== busy.id && table.status === "FREE" && table.seats >= busy.seats)
    .sort(
      (a, b) =>
        a.seats - busy.seats - (b.seats - busy.seats) ||
        Number(normalizeZone(b.zone) === zone) - Number(normalizeZone(a.zone) === zone) ||
        a.number - b.number,
    );
}
