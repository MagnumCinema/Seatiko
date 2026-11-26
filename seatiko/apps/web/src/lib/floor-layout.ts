/**
 * Floor plan geometry shared by the owner's hall editor and the guests' plan.
 *
 * The hall is a fixed 16:10 canvas of HALL_W × HALL_H units drawn scaled to the screen,
 * so what the owner places is exactly what guests see at any width. The API stores table
 * centres as fractions 0..1 of the hall; in memory everything here is in hall units.
 */
import type { TableStatus } from "@/lib/api";

export const HALL_W = 800;
export const HALL_H = 500;
/** Snap step (hall units): the visible grid has a line every GRID units. */
export const GRID = 20;

/** The API keeps table centres inside these fractions (backend clampX / clampY). */
export const TABLE_CLAMP = { minX: 0.08, maxX: 0.92, minY: 0.12, maxY: 0.88 } as const;

/** Grid points a table centre may snap to: the largest grid box inside TABLE_CLAMP. */
export const TABLE_BOUNDS = {
  minX: Math.ceil((TABLE_CLAMP.minX * HALL_W) / GRID) * GRID,
  maxX: Math.floor((TABLE_CLAMP.maxX * HALL_W) / GRID) * GRID,
  minY: Math.ceil((TABLE_CLAMP.minY * HALL_H) / GRID) * GRID,
  maxY: Math.floor((TABLE_CLAMP.maxY * HALL_H) / GRID) * GRID,
} as const;

/** Length of the door on the wall and how deep its walkway reaches into the hall. */
export const DOOR_LEN = 100;
export const DOOR_DEPTH = 40;
/** Door centre stays this far from the corners (grid-aligned, ≥ DOOR_LEN / 2). */
const DOOR_MARGIN = Math.ceil(DOOR_LEN / 2 / GRID) * GRID;
/** Smallest bar / kitchen block (two grid cells each way). */
export const BOX_MIN = GRID * 2;
/** Free space a table keeps around it (hall units), so neighbours never read as one block. */
export const TABLE_GAP = 8;
/** How far (hall units) a dropped table may be pushed to the nearest free spot before the drop is refused. */
export const PUSH_RADIUS = GRID * 6;

export type Rot = 0 | 90;
export type Point = { x: number; y: number };
export type Size = { w: number; h: number };
/** Top-left corner and size, in hall units. */
export type Rect = { x: number; y: number; w: number; h: number };
export type WallSide = "top" | "right" | "bottom" | "left";
/** A door on a wall; `at` is its centre along that wall, in hall units. */
export type Entrance = { side: WallSide; at: number };
export type BoxKind = "bar" | "kitchen";
export type FixtureKind = BoxKind | "entrance";
/** Bar and kitchen can be removed (null); every zone keeps one entrance. */
export type ZoneFixtures = { bar: Rect | null; kitchen: Rect | null; entrance: Entrance };

/** A table on the editor's plan: centre in hall units. */
export type DraftTable = {
  key: string;
  number: number;
  seats: number;
  x: number;
  y: number;
  rot: Rot;
  zone: string;
  status: TableStatus;
  /** Seated or reserved now: may be moved, but not deleted or renumbered. */
  locked: boolean;
};

/** Everything the editor edits: tables plus the bar / kitchen / entrance of each zone that was touched. */
export type FloorPlanState = {
  tables: DraftTable[];
  fixtures: Record<string, ZoneFixtures>;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function snap(value: number, step = GRID) {
  return Math.round(value / step) * step;
}

/**
 * Footprint of a table with its chairs, in hall units. Mirrors the schematic CSS
 * (`seatingClass`): oval 58×40, portrait 42×62, large 46×78, booth 44×70, plus chairs
 * (15 units) or benches (14 units) on both long sides.
 */
export function tableSize(seats: number, rot: Rot = 0): Size {
  const base =
    seats <= 2
      ? { w: 58 + 30, h: 40 }
      : seats >= 7
        ? { w: 44 + 28, h: 70 }
        : seats >= 5
          ? { w: 46 + 30, h: 78 }
          : { w: 42 + 30, h: 62 };
  return rot === 90 ? { w: base.h, h: base.w } : base;
}

export function rectAround(center: Point, size: Size): Rect {
  return { x: center.x - size.w / 2, y: center.y - size.h / 2, w: size.w, h: size.h };
}

export function tableRect(table: Pick<DraftTable, "x" | "y" | "seats" | "rot">): Rect {
  return rectAround(table, tableSize(table.seats, table.rot));
}

/** Edges may touch; only a shared area counts as an overlap. */
export function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function insideHall(r: Rect) {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= HALL_W && r.y + r.h <= HALL_H;
}

/** Nearest grid point inside the table bounds. */
export function snapTableCenter(p: Point): Point {
  return {
    x: clamp(snap(p.x), TABLE_BOUNDS.minX, TABLE_BOUNDS.maxX),
    y: clamp(snap(p.y), TABLE_BOUNDS.minY, TABLE_BOUNDS.maxY),
  };
}

/** Inside the API clamp (exactly where it will be saved), within the walls and TABLE_GAP away from every obstacle. */
export function tableFits(center: Point, size: Size, obstacles: Rect[]): boolean {
  const eps = 1e-6;
  if (
    center.x < TABLE_CLAMP.minX * HALL_W - eps ||
    center.x > TABLE_CLAMP.maxX * HALL_W + eps ||
    center.y < TABLE_CLAMP.minY * HALL_H - eps ||
    center.y > TABLE_CLAMP.maxY * HALL_H + eps
  ) {
    return false;
  }
  const rect = rectAround(center, size);
  if (!insideHall(rect)) return false;
  const padded = rectAround(center, { w: size.w + TABLE_GAP * 2, h: size.h + TABLE_GAP * 2 });
  return !obstacles.some((o) => rectsOverlap(padded, o));
}

/** All snap points for a table centre, ordered by distance from `from` (ties: top to bottom, left to right). */
function gridPointsByDistance(from: Point): Point[] {
  const points: Point[] = [];
  for (let y = TABLE_BOUNDS.minY; y <= TABLE_BOUNDS.maxY; y += GRID) {
    for (let x = TABLE_BOUNDS.minX; x <= TABLE_BOUNDS.maxX; x += GRID) points.push({ x, y });
  }
  const dist = (p: Point) => (p.x - from.x) ** 2 + (p.y - from.y) ** 2;
  return points.sort((a, b) => dist(a) - dist(b) || a.y - b.y || a.x - b.x);
}

/** The free grid spot nearest to `preferred` (within `maxDistance`), or null when the zone is full. */
export function findFreeSpot(
  preferred: Point,
  size: Size,
  obstacles: Rect[],
  maxDistance = Number.POSITIVE_INFINITY,
): Point | null {
  for (const p of gridPointsByDistance(preferred)) {
    if (Math.hypot(p.x - preferred.x, p.y - preferred.y) > maxDistance) return null;
    if (tableFits(p, size, obstacles)) return p;
  }
  return null;
}

export type Placement = { at: Point; pushed: boolean };

/**
 * Where a table dropped at `raw` lands: the snapped point if it is free, else the nearest
 * free grid spot within `maxPush`, else null (the drop is refused).
 */
export function resolveTableDrop(
  raw: Point,
  size: Size,
  obstacles: Rect[],
  maxPush = PUSH_RADIUS,
): Placement | null {
  const snapped = snapTableCenter(raw);
  if (tableFits(snapped, size, obstacles)) return { at: snapped, pushed: false };
  const free = findFreeSpot(snapped, size, obstacles, maxPush);
  return free ? { at: free, pushed: true } : null;
}

/** Grid-aligned bar / kitchen block inside the hall, at least BOX_MIN each way. */
export function snapBox(r: Rect): Rect {
  const w = clamp(snap(r.w), BOX_MIN, HALL_W);
  const h = clamp(snap(r.h), BOX_MIN, HALL_H);
  return { x: clamp(snap(r.x), 0, HALL_W - w), y: clamp(snap(r.y), 0, HALL_H - h), w, h };
}

/** Block resized by its bottom-right corner, dragged to `corner`. */
export function resizeBox(start: Rect, corner: Point): Rect {
  const w = clamp(snap(corner.x - start.x), BOX_MIN, HALL_W - start.x);
  const h = clamp(snap(corner.y - start.y), BOX_MIN, HALL_H - start.y);
  return { x: start.x, y: start.y, w, h };
}

export function boxFits(r: Rect, obstacles: Rect[]) {
  return insideHall(r) && !obstacles.some((o) => rectsOverlap(r, o));
}

/** Nearest free grid position for a block of `preferred`'s size (keeps its size), or null when nothing fits. */
export function findFreeBox(preferred: Rect, obstacles: Rect[]): Rect | null {
  const start = snapBox(preferred);
  const spots: Rect[] = [];
  for (let y = 0; y + start.h <= HALL_H; y += GRID) {
    for (let x = 0; x + start.w <= HALL_W; x += GRID) spots.push({ ...start, x, y });
  }
  const dist = (r: Rect) => (r.x - start.x) ** 2 + (r.y - start.y) ** 2;
  spots.sort((a, b) => dist(a) - dist(b) || a.y - b.y || a.x - b.x);
  return spots.find((r) => boxFits(r, obstacles)) ?? null;
}

/** Door rectangle: on its wall, DOOR_LEN long and DOOR_DEPTH deep (the walkway kept clear). */
export function entranceRect(e: Entrance): Rect {
  const half = DOOR_LEN / 2;
  switch (e.side) {
    case "top":
      return { x: e.at - half, y: 0, w: DOOR_LEN, h: DOOR_DEPTH };
    case "bottom":
      return { x: e.at - half, y: HALL_H - DOOR_DEPTH, w: DOOR_LEN, h: DOOR_DEPTH };
    case "left":
      return { x: 0, y: e.at - half, w: DOOR_DEPTH, h: DOOR_LEN };
    case "right":
      return { x: HALL_W - DOOR_DEPTH, y: e.at - half, w: DOOR_DEPTH, h: DOOR_LEN };
  }
}

/** The door goes to the wall nearest to `p`, its centre snapped along that wall and kept off the corners. */
export function snapEntrance(p: Point): Entrance {
  const distance: Record<WallSide, number> = {
    top: p.y,
    bottom: HALL_H - p.y,
    left: p.x,
    right: HALL_W - p.x,
  };
  const order: WallSide[] = ["bottom", "top", "left", "right"];
  const side = order.reduce((best, s) => (distance[s] < distance[best] ? s : best), order[0]);
  const along = side === "top" || side === "bottom";
  const wall = along ? HALL_W : HALL_H;
  return { side, at: clamp(snap(along ? p.x : p.y), DOOR_MARGIN, wall - DOOR_MARGIN) };
}

export function entranceFits(e: Entrance, obstacles: Rect[]) {
  return boxFits(entranceRect(e), obstacles);
}

/** What a new venue zone starts with: the main hall has a bar, a kitchen and the entrance; other zones only an entrance. */
export function defaultZoneFixtures(zone: string): ZoneFixtures {
  const entrance: Entrance = { side: "bottom", at: 700 };
  if (zone !== "hall") return { bar: null, kitchen: null, entrance };
  return {
    bar: { x: 20, y: 60, w: 40, h: 340 },
    kitchen: { x: 660, y: 20, w: 120, h: 40 },
    entrance,
  };
}

export function fixturesOf(fixtures: Record<string, ZoneFixtures>, zone: string): ZoneFixtures {
  return fixtures[zone] ?? defaultZoneFixtures(zone);
}

/** Default size and place for a bar / kitchen put back on the plan. */
export function defaultBox(kind: BoxKind): Rect {
  return kind === "bar" ? { x: 20, y: 60, w: 40, h: 340 } : { x: 660, y: 20, w: 120, h: 40 };
}

/** Id of a plan item: `t:<table key>`, or the fixture kind. */
export type ItemId = string;
export const tableId = (key: string): ItemId => `t:${key}`;

export type PlanItem = { id: ItemId; rect: Rect };

/** Everything on one zone's plan, as rectangles. */
export function planItems(tables: DraftTable[], fixtures: ZoneFixtures, zone: string): PlanItem[] {
  const items: PlanItem[] = tables
    .filter((t) => t.zone === zone)
    .map((t) => ({ id: tableId(t.key), rect: tableRect(t) }));
  if (fixtures.bar) items.push({ id: "bar", rect: fixtures.bar });
  if (fixtures.kitchen) items.push({ id: "kitchen", rect: fixtures.kitchen });
  items.push({ id: "entrance", rect: entranceRect(fixtures.entrance) });
  return items;
}

export function obstaclesExcept(items: PlanItem[], id: ItemId): Rect[] {
  return items.filter((item) => item.id !== id).map((item) => item.rect);
}

/** Items that overlap another one (left over from older layouts or the API's own clamping). */
export function findConflicts(items: PlanItem[]): Set<ItemId> {
  const out = new Set<ItemId>();
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (rectsOverlap(items[i].rect, items[j].rect)) {
        out.add(items[i].id);
        out.add(items[j].id);
      }
    }
  }
  return out;
}

/** Next table number: the first gap after the lowest number, else one past the highest (1 for an empty hall). */
export function nextTableNumber(numbers: number[]): number {
  if (numbers.length === 0) return 1;
  const used = new Set(numbers);
  let n = Math.max(1, Math.min(...numbers));
  while (used.has(n)) n += 1;
  return n;
}

export const TABLE_NUMBER_MAX = 999;

export type NumberCheck = { ok: true; value: number } | { ok: false; error: "invalid" | "taken" };

/** Validates a typed table number: a whole number 1..999 not used by another table of the venue. */
export function checkTableNumber(text: string, otherNumbers: number[]): NumberCheck {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: "invalid" };
  const value = Number(trimmed);
  if (value < 1 || value > TABLE_NUMBER_MAX) return { ok: false, error: "invalid" };
  if (otherNumbers.includes(value)) return { ok: false, error: "taken" };
  return { ok: true, value };
}

// —— Stored layout (bar / kitchen / entrance per zone, table rotation) ——

/**
 * Persisted form: fractions 0..1 of the hall, like table positions in the API.
 * `rot` lists tables turned by 90°, keyed by table number.
 */
export type StoredFloorLayout = {
  v: 1;
  zones: Record<
    string,
    {
      bar: StoredRect | null;
      kitchen: StoredRect | null;
      entrance: { side: WallSide; at: number };
    }
  >;
  rot?: Record<string, 90>;
};
type StoredRect = { x: number; y: number; w: number; h: number };

export type FloorLayout = {
  zones: Record<string, ZoneFixtures>;
  /** Table numbers turned by 90°. */
  rotated: number[];
};

export const EMPTY_LAYOUT: FloorLayout = { zones: {}, rotated: [] };

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

function storeRect(r: Rect): StoredRect {
  return { x: round6(r.x / HALL_W), y: round6(r.y / HALL_H), w: round6(r.w / HALL_W), h: round6(r.h / HALL_H) };
}

export function serializeLayout(layout: FloorLayout): StoredFloorLayout {
  const zones: StoredFloorLayout["zones"] = {};
  for (const [zone, f] of Object.entries(layout.zones)) {
    const along = f.entrance.side === "top" || f.entrance.side === "bottom";
    zones[zone] = {
      bar: f.bar ? storeRect(f.bar) : null,
      kitchen: f.kitchen ? storeRect(f.kitchen) : null,
      entrance: { side: f.entrance.side, at: round6(f.entrance.at / (along ? HALL_W : HALL_H)) },
    };
  }
  const out: StoredFloorLayout = { v: 1, zones };
  const rotated = [...new Set(layout.rotated)].sort((a, b) => a - b);
  if (rotated.length) out.rot = Object.fromEntries(rotated.map((n) => [String(n), 90 as const]));
  return out;
}

const isFraction = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const SIDES: WallSide[] = ["top", "right", "bottom", "left"];

function readRect(raw: unknown): Rect | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const { x, y, w, h } = raw as Record<string, unknown>;
  if (![x, y, w, h].every(isFraction) || (w as number) <= 0 || (h as number) <= 0) return undefined;
  return snapBox({
    x: (x as number) * HALL_W,
    y: (y as number) * HALL_H,
    w: (w as number) * HALL_W,
    h: (h as number) * HALL_H,
  });
}

function readEntrance(raw: unknown): Entrance | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { side, at } = raw as Record<string, unknown>;
  if (!SIDES.includes(side as WallSide) || !isFraction(at)) return undefined;
  const s = side as WallSide;
  const along = s === "top" || s === "bottom";
  const wall = along ? HALL_W : HALL_H;
  return { side: s, at: clamp(snap(at * wall), DOOR_MARGIN, wall - DOOR_MARGIN) };
}

/** Reads a stored layout; anything malformed falls back to the zone defaults instead of throwing. */
export function parseLayout(raw: unknown): FloorLayout {
  if (!raw || typeof raw !== "object" || (raw as { v?: unknown }).v !== 1) return EMPTY_LAYOUT;
  const data = raw as { zones?: unknown; rot?: unknown };
  const zones: Record<string, ZoneFixtures> = {};
  if (data.zones && typeof data.zones === "object") {
    for (const [zone, value] of Object.entries(data.zones as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const fallback = defaultZoneFixtures(zone);
      const bar = readRect(v.bar);
      const kitchen = readRect(v.kitchen);
      zones[zone] = {
        bar: bar === undefined ? fallback.bar : bar,
        kitchen: kitchen === undefined ? fallback.kitchen : kitchen,
        entrance: readEntrance(v.entrance) ?? fallback.entrance,
      };
    }
  }
  const rotated: number[] = [];
  if (data.rot && typeof data.rot === "object") {
    for (const [key, value] of Object.entries(data.rot as Record<string, unknown>)) {
      const n = Number(key);
      if (value === 90 && Number.isInteger(n) && n > 0) rotated.push(n);
    }
  }
  return { zones, rotated: rotated.sort((a, b) => a - b) };
}

/** The layout part of an editor state (what is stored outside the tables API). */
export function layoutOf(state: FloorPlanState): FloorLayout {
  return {
    zones: state.fixtures,
    rotated: state.tables.filter((t) => t.rot === 90).map((t) => t.number),
  };
}

// —— API conversion ——

type ApiTable = {
  id: string;
  number: number;
  seats: number;
  x: number;
  y: number;
  zone?: string;
  status: TableStatus;
};

export function draftFromApi(
  table: ApiTable,
  zone: string,
  rotated: ReadonlySet<number>,
): DraftTable {
  return {
    key: table.id,
    number: table.number,
    seats: table.seats,
    x: table.x * HALL_W,
    y: table.y * HALL_H,
    rot: rotated.has(table.number) ? 90 : 0,
    zone,
    status: table.status,
    locked: table.status === "OCCUPIED" || table.status === "RESERVED",
  };
}

export function draftToApi(table: DraftTable) {
  return {
    number: table.number,
    seats: table.seats,
    x: round6(table.x / HALL_W),
    y: round6(table.y / HALL_H),
    zone: table.zone || "hall",
  };
}

/**
 * Comparable fingerprint of a plan: equal fingerprints mean nothing to save. A zone whose
 * fixtures equal its defaults counts the same as a zone that was never touched.
 */
export function planSignature(state: FloorPlanState): string {
  const tables = state.tables
    .map((t) => {
      const api = draftToApi(t);
      return [api.number, api.seats, api.x, api.y, api.zone, t.rot];
    })
    .sort((a, b) => (a[0] as number) - (b[0] as number));
  const stored = serializeLayout({ zones: state.fixtures, rotated: [] }).zones;
  const fixtures = Object.keys(stored)
    .sort()
    .map((zone) => [zone, JSON.stringify(stored[zone])])
    .filter(([zone, json]) => {
      const defaults = serializeLayout({ zones: { [zone]: defaultZoneFixtures(zone) }, rotated: [] }).zones[zone];
      return json !== JSON.stringify(defaults);
    });
  return JSON.stringify({ tables, fixtures });
}
