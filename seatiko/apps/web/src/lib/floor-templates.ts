import {
  fixturesOf,
  planItems,
  resolveTableDrop,
  tableSize,
  type DraftTable,
  type FloorPlanState,
} from "@/lib/floor-layout";

export type FloorTemplateId = "small" | "cafe" | "hall";

type TemplateTable = { seats: number; x: number; y: number; zone: string };

/** Starter layouts; every zone is its own plan, so each zone's tables sit centred on it (hall units). */
export const FLOOR_TEMPLATES: Record<FloorTemplateId, TemplateTable[]> = {
  small: [
    { seats: 4, x: 240, y: 200, zone: "hall" },
    { seats: 4, x: 400, y: 200, zone: "hall" },
    { seats: 4, x: 560, y: 200, zone: "hall" },
    { seats: 2, x: 400, y: 240, zone: "terrace" },
  ],
  cafe: [
    { seats: 4, x: 240, y: 160, zone: "hall" },
    { seats: 4, x: 400, y: 160, zone: "hall" },
    { seats: 4, x: 560, y: 160, zone: "hall" },
    { seats: 6, x: 400, y: 320, zone: "hall" },
    { seats: 2, x: 300, y: 240, zone: "terrace" },
    { seats: 4, x: 500, y: 240, zone: "terrace" },
    { seats: 4, x: 240, y: 240, zone: "street" },
    { seats: 4, x: 400, y: 240, zone: "street" },
    { seats: 6, x: 560, y: 240, zone: "street" },
  ],
  hall: [
    { seats: 4, x: 240, y: 160, zone: "hall" },
    { seats: 4, x: 400, y: 160, zone: "hall" },
    { seats: 4, x: 560, y: 160, zone: "hall" },
    { seats: 6, x: 400, y: 320, zone: "hall" },
    { seats: 2, x: 300, y: 240, zone: "terrace" },
    { seats: 4, x: 500, y: 240, zone: "terrace" },
    { seats: 4, x: 240, y: 160, zone: "street" },
    { seats: 4, x: 400, y: 160, zone: "street" },
    { seats: 6, x: 560, y: 160, zone: "street" },
    { seats: 8, x: 400, y: 320, zone: "street" },
  ],
};

/** Template tables are numbered from 1, skipping the numbers of the tables that stay. */
function smallestFreeNumber(used: number[]) {
  let n = 1;
  while (used.includes(n)) n += 1;
  return n;
}

/**
 * Replaces the free tables with a template. Seated / reserved tables stay where they are
 * (the API keeps them anyway), template tables get the next free numbers and move to the
 * nearest free spot when a kept table or the bar / kitchen / entrance is in the way.
 */
export function applyFloorTemplate(
  state: FloorPlanState,
  id: FloorTemplateId,
  makeKey: (index: number) => string,
): DraftTable[] {
  const tables: DraftTable[] = state.tables.filter((t) => t.locked);
  FLOOR_TEMPLATES[id].forEach((item, index) => {
    const size = tableSize(item.seats);
    const obstacles = planItems(tables, fixturesOf(state.fixtures, item.zone), item.zone).map((p) => p.rect);
    const placed = resolveTableDrop(item, size, obstacles, Number.POSITIVE_INFINITY);
    if (!placed) return;
    tables.push({
      key: makeKey(index),
      number: smallestFreeNumber(tables.map((t) => t.number)),
      seats: item.seats,
      x: placed.at.x,
      y: placed.at.y,
      rot: 0,
      zone: item.zone,
      status: "FREE",
      locked: false,
    });
  });
  return tables;
}
