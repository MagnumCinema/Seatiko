import { describe, expect, it } from "vitest";
import {
  buildAnyTableSlots,
  buildBookingSlots,
  dayPartForTime,
  groupSlotsByDayPart,
  parseOpeningHours,
} from "./booking-slots";

const at = (h: number, m = 0) => new Date(2026, 10, 6, h, m);
const label = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("parseOpeningHours", () => {
  it("reads hours from localized strings", () => {
    expect(parseOpeningHours("Пн–Вс 08:30–22:00")).toEqual({ openMin: 510, closeMin: 1320 });
    expect(parseOpeningHours("Mon–Sun 10:00-23:00")).toEqual({ openMin: 600, closeMin: 1380 });
  });

  it("handles past-midnight closing and garbage", () => {
    expect(parseOpeningHours("18:00–02:00")).toEqual({ openMin: 1080, closeMin: 1560 });
    expect(parseOpeningHours("")).toEqual({ openMin: 600, closeMin: 1380 });
  });
});

describe("buildBookingSlots", () => {
  const hours = { openMin: 10 * 60, closeMin: 14 * 60 };

  it("uses local time and keeps the whole booking inside opening hours", () => {
    const slots = buildBookingSlots({ day: at(0), now: at(6), hours, durationMin: 90 });
    expect(slots.map((s) => label(s.start))).toEqual([
      "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
    ]);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it("blocks past slots and the minimum lead time", () => {
    const slots = buildBookingSlots({ day: at(0), now: at(10, 50), hours, durationMin: 90 });
    const available = slots.filter((s) => s.available).map((s) => label(s.start));
    expect(available).toEqual(["11:30", "12:00", "12:30"]);
  });

  it("blocks slots overlapping existing bookings of the table", () => {
    const busy = [{ starts_at: at(11, 0).toISOString(), ends_at: at(12, 0).toISOString() }];
    const slots = buildBookingSlots({ day: at(0), now: at(6), hours, durationMin: 60, busy });
    const blocked = slots.filter((s) => !s.available).map((s) => label(s.start));
    expect(blocked).toEqual(["10:30", "11:00", "11:30"]);
  });
});

describe("buildAnyTableSlots", () => {
  const hours = { openMin: 10 * 60, closeMin: 13 * 60 };
  const busy = (h: number, m = 0) => [
    { starts_at: at(h, m).toISOString(), ends_at: at(h + 1, m + 30).toISOString() },
  ];

  it("picks the smallest free table and falls back to a bigger one", () => {
    const slots = buildAnyTableSlots({
      day: at(0),
      now: at(6),
      hours,
      durationMin: 60,
      candidates: [
        { id: "big", seats: 6, busy: [] },
        { id: "small", seats: 2, busy: busy(10) },
      ],
    });
    expect(slots.map((s) => `${label(s.start)}=${s.tableId}`)).toEqual([
      "10:00=big", "10:30=big", "11:00=big", "11:30=small", "12:00=small",
    ]);
  });

  it("marks a start unavailable only when every table is busy", () => {
    const slots = buildAnyTableSlots({
      day: at(0),
      now: at(6),
      hours,
      durationMin: 60,
      candidates: [
        { id: "a", seats: 2, busy: busy(10) },
        { id: "b", seats: 4, busy: busy(10) },
      ],
    });
    expect(slots.filter((s) => !s.available).map((s) => label(s.start))).toEqual([
      "10:00", "10:30", "11:00",
    ]);
    expect(buildAnyTableSlots({ day: at(0), now: at(6), hours, candidates: [] }).some((s) => s.available)).toBe(false);
  });
});

describe("dayPartForTime", () => {
  it("splits the day into morning, lunch, evening, late", () => {
    expect(dayPartForTime(at(11, 59))).toBe("morning");
    expect(dayPartForTime(at(12, 0))).toBe("lunch");
    expect(dayPartForTime(at(16, 59))).toBe("lunch");
    expect(dayPartForTime(at(17, 0))).toBe("evening");
    expect(dayPartForTime(at(20, 59))).toBe("evening");
    expect(dayPartForTime(at(21, 0))).toBe("late");
  });
});

describe("groupSlotsByDayPart", () => {
  it("groups slots and skips empty parts", () => {
    const slots = [
      { start: at(11, 0), available: true },
      { start: at(12, 30), available: true },
      { start: at(19, 0), available: false },
      { start: at(22, 0), available: true },
    ];
    expect(groupSlotsByDayPart(slots).map((g) => [g.id, g.slots.map((s) => label(s.start))])).toEqual([
      ["morning", ["11:00"]],
      ["lunch", ["12:30"]],
      ["evening", ["19:00"]],
      ["late", ["22:00"]],
    ]);
  });

  it("omits parts with no slots", () => {
    const slots = [{ start: at(18, 0), available: true }];
    expect(groupSlotsByDayPart(slots).map((g) => g.id)).toEqual(["evening"]);
  });
});
