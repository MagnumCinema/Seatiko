import { describe, expect, it } from "vitest";
import {
  BOX_MIN,
  DOOR_DEPTH,
  DOOR_LEN,
  GRID,
  HALL_H,
  HALL_W,
  PUSH_RADIUS,
  TABLE_BOUNDS,
  TABLE_GAP,
  TABLE_CLAMP,
  boxFits,
  checkTableNumber,
  defaultZoneFixtures,
  draftFromApi,
  draftToApi,
  entranceFits,
  entranceRect,
  findConflicts,
  findFreeBox,
  findFreeSpot,
  insideHall,
  layoutOf,
  nextTableNumber,
  parseLayout,
  planItems,
  planSignature,
  rectAround,
  rectsOverlap,
  resizeBox,
  resolveTableDrop,
  serializeLayout,
  snap,
  snapBox,
  snapEntrance,
  snapTableCenter,
  tableFits,
  tableRect,
  tableSize,
  type DraftTable,
  type FloorPlanState,
  type Rect,
} from "./floor-layout";
import { FLOOR_TEMPLATES, applyFloorTemplate } from "./floor-templates";

function table(partial: Partial<DraftTable> & { key: string }): DraftTable {
  return {
    number: 1,
    seats: 4,
    x: 400,
    y: 250,
    rot: 0,
    zone: "hall",
    status: "FREE",
    locked: false,
    ...partial,
  };
}

describe("hall and grid", () => {
  it("is a 16:10 hall with a grid that divides it evenly", () => {
    expect(HALL_W / HALL_H).toBeCloseTo(1.6);
    expect(HALL_W % GRID).toBe(0);
    expect(HALL_H % GRID).toBe(0);
  });

  it("keeps snapped table centres inside the API clamp so saving never moves a table", () => {
    expect(TABLE_BOUNDS).toEqual({ minX: 80, maxX: 720, minY: 60, maxY: 440 });
    expect(TABLE_BOUNDS.minX / HALL_W).toBeGreaterThanOrEqual(TABLE_CLAMP.minX);
    expect(TABLE_BOUNDS.maxX / HALL_W).toBeLessThanOrEqual(TABLE_CLAMP.maxX);
    expect(TABLE_BOUNDS.minY / HALL_H).toBeGreaterThanOrEqual(TABLE_CLAMP.minY);
    expect(TABLE_BOUNDS.maxY / HALL_H).toBeLessThanOrEqual(TABLE_CLAMP.maxY);
  });

  it("snaps to the nearest grid line", () => {
    expect(snap(0)).toBe(0);
    expect(snap(9)).toBe(0);
    expect(snap(10)).toBe(20);
    expect(snap(129)).toBe(120);
    expect(snap(131)).toBe(140);
  });
});

describe("table footprint", () => {
  it("matches the schematic table shapes with their chairs", () => {
    expect(tableSize(2)).toEqual({ w: 88, h: 40 });
    expect(tableSize(4)).toEqual({ w: 72, h: 62 });
    expect(tableSize(6)).toEqual({ w: 76, h: 78 });
    expect(tableSize(8)).toEqual({ w: 72, h: 70 });
  });

  it("swaps width and height when turned by 90°", () => {
    expect(tableSize(2, 90)).toEqual({ w: 40, h: 88 });
    expect(tableRect({ x: 100, y: 100, seats: 2, rot: 90 })).toEqual({ x: 80, y: 56, w: 40, h: 88 });
  });

  it("fits inside the hall at every corner of the table bounds", () => {
    for (const seats of [1, 2, 4, 6, 8, 20]) {
      for (const rot of [0, 90] as const) {
        for (const x of [TABLE_BOUNDS.minX, TABLE_BOUNDS.maxX]) {
          for (const y of [TABLE_BOUNDS.minY, TABLE_BOUNDS.maxY]) {
            expect(insideHall(rectAround({ x, y }, tableSize(seats, rot)))).toBe(true);
          }
        }
      }
    }
  });
});

describe("bounds", () => {
  it("snaps a pointer far outside the hall back onto the nearest edge grid point", () => {
    expect(snapTableCenter({ x: -500, y: -500 })).toEqual({ x: 80, y: 60 });
    expect(snapTableCenter({ x: 5000, y: 5000 })).toEqual({ x: 720, y: 440 });
    expect(snapTableCenter({ x: 401, y: 249 })).toEqual({ x: 400, y: 240 });
  });

  it("refuses centres outside the API clamp even on an empty plan", () => {
    const size = tableSize(4);
    expect(tableFits({ x: 40, y: 250 }, size, [])).toBe(false);
    expect(tableFits({ x: 400, y: 20 }, size, [])).toBe(false);
    expect(tableFits({ x: 64, y: 60 }, size, [])).toBe(true);
  });

  it("never drops a table outside the hall", () => {
    const placed = resolveTableDrop({ x: -1000, y: 9000 }, tableSize(6), []);
    expect(placed).toEqual({ at: { x: 80, y: 440 }, pushed: false });
  });
});

describe("collision", () => {
  const a: Rect = { x: 0, y: 0, w: 10, h: 10 };

  it("treats touching edges as free and shared area as overlap", () => {
    expect(rectsOverlap(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsOverlap(a, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
    expect(rectsOverlap(a, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap(a, { x: 2, y: 2, w: 2, h: 2 })).toBe(true);
  });

  it("blocks a table dropped on another table, the bar, the kitchen or the entrance walkway", () => {
    const fixtures = defaultZoneFixtures("hall");
    const other = table({ key: "b", x: 400, y: 240 });
    const items = planItems([other], fixtures, "hall");
    const obstacles = items.map((i) => i.rect);
    const size = tableSize(4);
    expect(tableFits({ x: 400, y: 240 }, size, obstacles)).toBe(false); // on the other table
    expect(tableFits({ x: 80, y: 200 }, size, obstacles)).toBe(false); // over the bar (x 20..60)
    expect(tableFits({ x: 700, y: 60 }, size, obstacles)).toBe(false); // under the kitchen (y 20..60)
    expect(tableFits({ x: 700, y: 440 }, size, obstacles)).toBe(false); // in front of the door
    expect(tableFits({ x: 240, y: 240 }, size, obstacles)).toBe(true);
  });

  it("keeps a small gap between a table and its neighbours", () => {
    const other = tableRect(table({ key: "a", x: 400, y: 240 })); // 72 wide: 364..436
    const size = tableSize(4);
    expect(tableFits({ x: 472, y: 240 }, size, [other])).toBe(false); // edge to edge
    expect(tableFits({ x: 400 + 72 + TABLE_GAP, y: 240 }, size, [other])).toBe(true);
  });

  it("only looks at the table's own zone", () => {
    const terraceTable = table({ key: "t", zone: "terrace", x: 400, y: 240 });
    const items = planItems([terraceTable], defaultZoneFixtures("hall"), "hall");
    expect(items.some((i) => i.id === "t:t")).toBe(false);
  });

  it("pushes a table dropped onto another to the nearest free spot", () => {
    const other = table({ key: "b", x: 400, y: 240 });
    const obstacles = [tableRect(other)];
    const placed = resolveTableDrop({ x: 404, y: 236 }, tableSize(4), obstacles);
    expect(placed?.pushed).toBe(true);
    expect(tableFits(placed!.at, tableSize(4), obstacles)).toBe(true);
    expect(Math.hypot(placed!.at.x - 400, placed!.at.y - 240)).toBeLessThanOrEqual(PUSH_RADIUS);
    // Snapped to the grid.
    expect(placed!.at.x % GRID).toBe(0);
    expect(placed!.at.y % GRID).toBe(0);
  });

  it("refuses the drop when nothing is free within the push radius", () => {
    const wall: Rect = { x: 200, y: 0, w: 400, h: 500 };
    expect(resolveTableDrop({ x: 400, y: 240 }, tableSize(4), [wall])).toBeNull();
    // An unlimited search still finds space outside the blocked strip.
    const far = resolveTableDrop({ x: 400, y: 240 }, tableSize(4), [wall], Number.POSITIVE_INFINITY);
    expect(far && tableFits(far.at, tableSize(4), [wall])).toBe(true);
  });

  it("lists every item that overlaps another", () => {
    const items = planItems(
      [table({ key: "a", x: 400, y: 240 }), table({ key: "b", x: 420, y: 250 }), table({ key: "c", x: 600, y: 240 })],
      defaultZoneFixtures("hall"),
      "hall",
    );
    expect([...findConflicts(items)].sort()).toEqual(["t:a", "t:b"]);
  });
});

describe("free spot for a new table", () => {
  it("uses the preferred point when it is free", () => {
    expect(findFreeSpot({ x: 400, y: 240 }, tableSize(4), [])).toEqual({ x: 400, y: 240 });
  });

  it("never stacks new tables on one spot", () => {
    const fixtures = defaultZoneFixtures("hall");
    const placed: DraftTable[] = [];
    for (let i = 0; i < 12; i += 1) {
      const obstacles = planItems(placed, fixtures, "hall").map((p) => p.rect);
      const spot = findFreeSpot({ x: 400, y: 240 }, tableSize(4), obstacles);
      expect(spot).not.toBeNull();
      placed.push(table({ key: String(i), number: i + 1, x: spot!.x, y: spot!.y }));
    }
    expect(findConflicts(planItems(placed, fixtures, "hall")).size).toBe(0);
  });

  it("returns null when the zone is full", () => {
    const everything: Rect = { x: 0, y: 0, w: HALL_W, h: HALL_H };
    expect(findFreeSpot({ x: 400, y: 240 }, tableSize(2), [everything])).toBeNull();
  });
});

describe("bar and kitchen blocks", () => {
  it("snaps position and size to the grid and keeps them inside the hall", () => {
    expect(snapBox({ x: -30, y: 7, w: 33, h: 3 })).toEqual({ x: 0, y: 0, w: 40, h: BOX_MIN });
    expect(snapBox({ x: 790, y: 495, w: 120, h: 40 })).toEqual({ x: 680, y: 460, w: 120, h: 40 });
  });

  it("resizes from the bottom-right corner without leaving the hall or going below the minimum", () => {
    const start: Rect = { x: 600, y: 400, w: 80, h: 40 };
    expect(resizeBox(start, { x: 2000, y: 2000 })).toEqual({ x: 600, y: 400, w: 200, h: 100 });
    expect(resizeBox(start, { x: 590, y: 390 })).toEqual({ x: 600, y: 400, w: BOX_MIN, h: BOX_MIN });
    expect(resizeBox(start, { x: 731, y: 449 })).toEqual({ x: 600, y: 400, w: 140, h: 40 });
  });

  it("puts a block back at its default place, or the nearest free one", () => {
    const bar: Rect = { x: 20, y: 60, w: 40, h: 340 };
    expect(findFreeBox(bar, [])).toEqual(bar);
    const blocker = tableRect(table({ key: "a", x: 80, y: 200 }));
    const moved = findFreeBox(bar, [blocker])!;
    expect(moved.w).toBe(40);
    expect(moved.h).toBe(340);
    expect(boxFits(moved, [blocker])).toBe(true);
    expect(findFreeBox(bar, [{ x: 0, y: 0, w: HALL_W, h: HALL_H }])).toBeNull();
  });

  it("cannot cover a table or another fixture", () => {
    const t = tableRect(table({ key: "a", x: 300, y: 240 }));
    expect(boxFits({ x: 260, y: 200, w: 80, h: 80 }, [t])).toBe(false);
    expect(boxFits({ x: 500, y: 200, w: 80, h: 80 }, [t])).toBe(true);
    expect(boxFits({ x: 760, y: 200, w: 80, h: 80 }, [])).toBe(false); // past the right wall
  });
});

describe("entrance", () => {
  it("snaps to the nearest wall", () => {
    expect(snapEntrance({ x: 400, y: 490 }).side).toBe("bottom");
    expect(snapEntrance({ x: 400, y: 10 }).side).toBe("top");
    expect(snapEntrance({ x: 5, y: 250 }).side).toBe("left");
    expect(snapEntrance({ x: 795, y: 250 }).side).toBe("right");
  });

  it("moves along the wall on the grid and stays off the corners", () => {
    expect(snapEntrance({ x: 333, y: 499 })).toEqual({ side: "bottom", at: 340 });
    expect(snapEntrance({ x: -50, y: 600 })).toEqual({ side: "bottom", at: 60 });
    expect(snapEntrance({ x: 900, y: 245 })).toEqual({ side: "right", at: 240 });
    expect(snapEntrance({ x: 790, y: 2 })).toEqual({ side: "top", at: 740 });
  });

  it("is a door on the wall with a walkway into the hall", () => {
    expect(entranceRect({ side: "bottom", at: 400 })).toEqual({ x: 350, y: HALL_H - DOOR_DEPTH, w: DOOR_LEN, h: DOOR_DEPTH });
    expect(entranceRect({ side: "left", at: 250 })).toEqual({ x: 0, y: 200, w: DOOR_DEPTH, h: DOOR_LEN });
    expect(entranceRect({ side: "right", at: 250 })).toEqual({ x: HALL_W - DOOR_DEPTH, y: 200, w: DOOR_DEPTH, h: DOOR_LEN });
    for (const side of ["top", "right", "bottom", "left"] as const) {
      expect(insideHall(entranceRect(snapEntrance(side === "top" ? { x: 0, y: 0 } : side === "bottom" ? { x: 800, y: 500 } : side === "left" ? { x: 0, y: 1 } : { x: 800, y: 499 })))).toBe(true);
    }
  });

  it("cannot open onto the bar", () => {
    const bar = defaultZoneFixtures("hall").bar!;
    expect(entranceFits({ side: "left", at: 240 }, [bar])).toBe(false);
    expect(entranceFits({ side: "bottom", at: 400 }, [bar])).toBe(true);
  });
});

describe("defaults", () => {
  it("gives the main hall a bar, kitchen and entrance that do not overlap", () => {
    const f = defaultZoneFixtures("hall");
    expect(f.bar && f.kitchen).toBeTruthy();
    expect(findConflicts(planItems([], f, "hall")).size).toBe(0);
    for (const item of planItems([], f, "hall")) expect(insideHall(item.rect)).toBe(true);
  });

  it("gives other zones only an entrance", () => {
    expect(defaultZoneFixtures("terrace")).toEqual({ bar: null, kitchen: null, entrance: { side: "bottom", at: 700 } });
  });
});

describe("table numbers", () => {
  it("fills the first gap after the lowest number, else continues", () => {
    expect(nextTableNumber([])).toBe(1);
    expect(nextTableNumber([1, 2, 3])).toBe(4);
    expect(nextTableNumber([1, 2, 4])).toBe(3);
    expect(nextTableNumber([11, 12, 13, 14, 15, 16, 19, 20])).toBe(17);
  });

  it("accepts only whole, free numbers from 1 to 999", () => {
    expect(checkTableNumber(" 12 ", [1, 2])).toEqual({ ok: true, value: 12 });
    expect(checkTableNumber("2", [1, 2])).toEqual({ ok: false, error: "taken" });
    for (const bad of ["", "0", "-3", "1.5", "abc", "1000"]) {
      expect(checkTableNumber(bad, [])).toEqual({ ok: false, error: "invalid" });
    }
  });
});

describe("stored layout", () => {
  const state: FloorPlanState = {
    tables: [table({ key: "a", number: 3, rot: 90 }), table({ key: "b", number: 7, x: 200 })],
    fixtures: {
      hall: { bar: null, kitchen: { x: 600, y: 20, w: 160, h: 60 }, entrance: { side: "left", at: 240 } },
      terrace: defaultZoneFixtures("terrace"),
    },
  };

  it("round-trips through JSON in hall fractions", () => {
    const stored = JSON.parse(JSON.stringify(serializeLayout(layoutOf(state))));
    expect(stored.v).toBe(1);
    expect(stored.zones.hall.kitchen).toEqual({ x: 0.75, y: 0.04, w: 0.2, h: 0.12 });
    expect(stored.rot).toEqual({ "3": 90 });
    expect(parseLayout(stored)).toEqual({ zones: state.fixtures, rotated: [3] });
  });

  it("ignores garbage and falls back to defaults per field", () => {
    expect(parseLayout(null)).toEqual({ zones: {}, rotated: [] });
    expect(parseLayout({ v: 2, zones: {} })).toEqual({ zones: {}, rotated: [] });
    const parsed = parseLayout({
      v: 1,
      zones: { hall: { bar: { x: "1" }, kitchen: null, entrance: { side: "roof", at: 9 } }, bad: 5 },
      rot: { "4": 90, x: 90, "5": 45, "-1": 90 },
    });
    expect(parsed.zones.hall.bar).toEqual(defaultZoneFixtures("hall").bar);
    expect(parsed.zones.hall.kitchen).toBeNull();
    expect(parsed.zones.hall.entrance).toEqual(defaultZoneFixtures("hall").entrance);
    expect(parsed.zones.bad).toBeUndefined();
    expect(parsed.rotated).toEqual([4]);
  });
});

describe("API conversion", () => {
  it("converts between API fractions and hall units", () => {
    const draft = draftFromApi(
      { id: "id-1", number: 5, seats: 4, x: 0.16, y: 0.36, zone: "hall", status: "RESERVED" },
      "hall",
      new Set([5]),
    );
    expect(draft).toMatchObject({ key: "id-1", x: 128, y: 180, rot: 90, locked: true });
    expect(draftToApi(draft)).toEqual({ number: 5, seats: 4, x: 0.16, y: 0.36, zone: "hall" });
    expect(draftToApi({ ...draft, x: 80, y: 440 })).toMatchObject({ x: 0.1, y: 0.88 });
  });

  it("sees no change when fixtures only became explicit defaults", () => {
    const a: FloorPlanState = { tables: [table({ key: "a" })], fixtures: {} };
    const b: FloorPlanState = { tables: [table({ key: "a" })], fixtures: { hall: defaultZoneFixtures("hall") } };
    expect(planSignature(a)).toBe(planSignature(b));
    const moved = { ...b, fixtures: { hall: { ...defaultZoneFixtures("hall"), kitchen: null } } };
    expect(planSignature(moved)).not.toBe(planSignature(a));
    expect(planSignature({ ...a, tables: [table({ key: "a", rot: 90 })] })).not.toBe(planSignature(a));
  });
});

describe("templates", () => {
  it("lay out every zone inside the bounds with no overlaps, around the default fixtures", () => {
    for (const items of Object.values(FLOOR_TEMPLATES)) {
      const zones = [...new Set(items.map((i) => i.zone))];
      for (const zone of zones) {
        const tables = items
          .filter((i) => i.zone === zone)
          .map((i, n) => table({ key: `${zone}-${n}`, number: n + 1, seats: i.seats, x: i.x, y: i.y, zone }));
        for (const t of tables) {
          expect(snapTableCenter(t)).toEqual({ x: t.x, y: t.y });
        }
        expect(findConflicts(planItems(tables, defaultZoneFixtures(zone), zone)).size).toBe(0);
      }
    }
  });

  it("keep seated and reserved tables and number around them", () => {
    const state: FloorPlanState = {
      tables: [
        table({ key: "busy", number: 2, x: 400, y: 200, status: "OCCUPIED", locked: true }),
        table({ key: "free", number: 9, x: 600, y: 300 }),
      ],
      fixtures: {},
    };
    const next = applyFloorTemplate(state, "small", (i) => `new-${i}`);
    expect(next.find((t) => t.key === "busy")).toEqual(state.tables[0]);
    expect(next.find((t) => t.key === "free")).toBeUndefined();
    expect(next.map((t) => t.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    for (const zone of ["hall", "terrace"]) {
      expect(findConflicts(planItems(next, defaultZoneFixtures(zone), zone)).size).toBe(0);
    }
  });
});
