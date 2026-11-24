import { describe, expect, it } from "vitest";
import { availabilityRank, fromApiAvailability, venueAvailability, venueDuration } from "./venue-availability";
import { DEFAULT_BOOKING_RULES } from "./venue-rules";

const day = new Date(2026, 10, 12);
const now = new Date(2026, 10, 12, 9, 0);
const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m);
const hours = { openMin: 10 * 60, closeMin: 23 * 60 };
const tables = [
  { id: "t2", seats: 2 },
  { id: "t4", seats: 4 },
];
const busy = (tableId: string, from: Date, to: Date) => ({
  table_id: tableId,
  starts_at: from.toISOString(),
  ends_at: to.toISOString(),
});

describe("venueDuration", () => {
  it("keeps the requested length when the venue offers it", () => {
    expect(venueDuration(DEFAULT_BOOKING_RULES, 120)).toBe(120);
  });

  it("falls back to the longest allowed length below the request", () => {
    expect(venueDuration({ ...DEFAULT_BOOKING_RULES, max_visit_duration_min: 120 }, 180)).toBe(120);
  });
});

describe("venueAvailability", () => {
  it("finds the exact wanted time", () => {
    const result = venueAvailability({
      query: { day, now, guests: 2, durationMin: 90, target: at(19, 30) },
      rules: DEFAULT_BOOKING_RULES,
      hours,
      tables,
      schedule: [],
    });
    expect(result.fits).toBe(true);
    expect(result.exact?.start).toEqual(at(19, 30));
    expect(result.exact?.tableId).toBe("t2");
    expect(result.slots).toHaveLength(4);
    expect(result.slots.map((s) => s.start.getHours() * 60 + s.start.getMinutes())).toEqual([
      18 * 60 + 30,
      19 * 60,
      19 * 60 + 30,
      20 * 60,
    ]);
  });

  it("uses a bigger table when the small one is busy", () => {
    const result = venueAvailability({
      query: { day, now, guests: 2, durationMin: 90, target: at(19) },
      rules: DEFAULT_BOOKING_RULES,
      hours,
      tables,
      schedule: [busy("t2", at(18), at(21))],
    });
    expect(result.exact?.tableId).toBe("t4");
  });

  it("offers nearby times when the wanted one is taken", () => {
    const result = venueAvailability({
      query: { day, now, guests: 3, durationMin: 90, target: at(19) },
      rules: DEFAULT_BOOKING_RULES,
      hours,
      tables,
      schedule: [busy("t4", at(18, 30), at(20))],
    });
    expect(result.exact).toBeNull();
    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      const s = slot.start.getTime();
      const overlaps = s < at(20).getTime() && s + 90 * 60_000 > at(18, 30).getTime();
      expect(overlaps).toBe(false);
      expect(Math.abs(s - at(19).getTime())).toBeLessThanOrEqual(90 * 60_000);
    }
  });

  it("reports when no table seats the party", () => {
    const result = venueAvailability({
      query: { day, now, guests: 6, durationMin: 90, target: at(19) },
      rules: DEFAULT_BOOKING_RULES,
      hours,
      tables,
      schedule: [],
    });
    expect(result).toMatchObject({ fits: false, exact: null, slots: [] });
  });

  it("returns the earliest free starts for 'as soon as possible'", () => {
    const result = venueAvailability({
      query: { day, now: at(12, 10), guests: 2, durationMin: 60, target: null },
      rules: DEFAULT_BOOKING_RULES,
      hours,
      tables,
      schedule: [],
    });
    expect(result.slots[0].start).toEqual(at(12, 30));
    expect(result.slots).toHaveLength(4);
  });

  it("respects the venue booking step", () => {
    const result = venueAvailability({
      query: { day, now, guests: 2, durationMin: 90, target: at(19, 30) },
      rules: { ...DEFAULT_BOOKING_RULES, booking_interval_min: 60 },
      hours,
      tables,
      schedule: [],
    });
    expect(result.exact).toBeNull();
    expect(result.slots.every((s) => s.start.getMinutes() === 0)).toBe(true);
  });
});

describe("availabilityRank", () => {
  it("puts exact matches first and empty results last", () => {
    const target = at(19);
    const exact = venueAvailability({
      query: { day, now, guests: 2, durationMin: 90, target },
      rules: DEFAULT_BOOKING_RULES,
      hours,
      tables,
      schedule: [],
    });
    const none = { durationMin: 90, fits: true, exact: null, slots: [] };
    expect(availabilityRank(exact, target)).toBe(0);
    expect(availabilityRank(none, target)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("fromApiAvailability", () => {
  const slot = (d: Date, table = "t2") => ({ starts_at: d.toISOString(), table_id: table, table_number: 1 });

  it("maps slots and marks the exact match", () => {
    const { availability, laterToday } = fromApiAvailability(
      { venue_id: "v", duration_min: 90, fits: true, exact: true, slots: [slot(at(18, 30)), slot(at(19), "t4")] },
      at(19),
    );
    expect(availability.durationMin).toBe(90);
    expect(availability.slots.map((s) => s.tableId)).toEqual(["t2", "t4"]);
    expect(availability.exact?.start.getTime()).toBe(at(19).getTime());
    expect(laterToday).toBeNull();
  });

  it("offers later_today only when nothing is near the wanted time", () => {
    const { availability, laterToday } = fromApiAvailability(
      { venue_id: "v", duration_min: 90, fits: true, exact: false, slots: [], later_today: [slot(at(21))] },
      at(12),
    );
    expect(availability.slots).toEqual([]);
    expect(availability.exact).toBeNull();
    expect(laterToday?.slots[0].start.getTime()).toBe(at(21).getTime());
  });

  it("keeps too-small venues as not fitting", () => {
    const { availability, laterToday } = fromApiAvailability(
      { venue_id: "v", duration_min: 90, fits: false, exact: false, slots: [] },
      null,
    );
    expect(availability.fits).toBe(false);
    expect(laterToday).toBeNull();
  });
});
