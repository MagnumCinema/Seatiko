import { describe, expect, it } from "vitest";
import {
  PICKER_MODE_KEY,
  ROLLING_WEEKS,
  calendarView,
  shiftWeeks,
  dayCellState,
  dayKey,
  monthWeeks,
  parseDayKey,
  readPickerMode,
  startOfWeek,
  weekdayHeads,
  weekRangeTitle,
  weeksBetween,
  writePickerMode,
} from "./date-picker";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe("picker mode memory", () => {
  it("defaults to cards and remembers the calendar", () => {
    const storage = memoryStorage();
    expect(readPickerMode(storage)).toBe("cards");
    writePickerMode("calendar", storage);
    expect(storage.data.get(PICKER_MODE_KEY)).toBe("calendar");
    expect(readPickerMode(storage)).toBe("calendar");
  });

  it("ignores junk values and blocked storage", () => {
    expect(readPickerMode(memoryStorage({ [PICKER_MODE_KEY]: "grid" }))).toBe("cards");
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readPickerMode(blocked)).toBe("cards");
    expect(() => writePickerMode("calendar", blocked)).not.toThrow();
  });
});

describe("day keys", () => {
  it("round-trips local days", () => {
    expect(dayKey(d(2026, 11, 3))).toBe("2026-11-03");
    expect(parseDayKey("2026-11-03")?.getDate()).toBe(3);
    expect(parseDayKey("03.11.2026")).toBeNull();
  });
});

describe("week grids", () => {
  it("starts weeks on Monday", () => {
    // 2026-11-28 is a Saturday.
    expect(dayKey(startOfWeek(d(2026, 11, 28)))).toBe("2026-11-23");
    expect(dayKey(startOfWeek(d(2026, 11, 23)))).toBe("2026-11-23");
    expect(dayKey(startOfWeek(d(2026, 11, 29)))).toBe("2026-11-23");
  });

  it("covers the 7-day booking window across a month end in whole weeks", () => {
    const weeks = weeksBetween(d(2026, 11, 28), d(2026, 12, 4));
    expect(weeks).toHaveLength(2);
    expect(dayKey(weeks[0][0])).toBe("2026-11-23");
    expect(dayKey(weeks[1][6])).toBe("2026-12-06");
  });

  it("covers a whole month", () => {
    const weeks = monthWeeks(d(2026, 11, 15));
    expect(dayKey(weeks[0][0])).toBe("2026-10-26");
    expect(dayKey(weeks[weeks.length - 1][6])).toBe("2026-12-06");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });
});

describe("calendarView", () => {
  // Booking window: today (Sat 28 Nov) + 6 days → Fri 4 Dec, paged one week at a time.
  const min = d(2026, 11, 28);
  const max = d(2026, 12, 4);

  it("pages the booking window one week at a time: ‹ off on this week, › off at the window end", () => {
    const first = calendarView(min, max, min, 1);
    expect(first.weeks).toHaveLength(1);
    expect([dayKey(first.from), dayKey(first.to)]).toEqual(["2026-11-23", "2026-11-29"]);
    expect(first.canPrev).toBe(false);
    expect(first.canNext).toBe(true);
    const second = calendarView(min, max, shiftWeeks(first, 1), 1);
    expect([dayKey(second.from), dayKey(second.to)]).toEqual(["2026-11-30", "2026-12-06"]);
    expect(second.canPrev).toBe(true);
    expect(second.canNext).toBe(false);
    expect(dayKey(shiftWeeks(second, -1))).toBe("2026-11-23");
  });

  it("opens on the week of the picked day and clamps anchors outside the window", () => {
    expect(dayKey(calendarView(min, max, d(2026, 12, 2), 1).from)).toBe("2026-11-30");
    expect(dayKey(calendarView(min, max, d(2026, 1, 1), 1).from)).toBe("2026-11-23");
    expect(dayKey(calendarView(min, max, d(2030, 1, 1), 1).from)).toBe("2026-11-30");
  });

  it("shows a long range as rolling weeks from the anchor's week and clamps it", () => {
    const end = d(2027, 11, 28);
    const first = calendarView(min, end, d(2026, 1, 1));
    expect(first.weeks).toHaveLength(ROLLING_WEEKS);
    // Starts with the week of today (Mon 23 Nov), not with a month of past days.
    expect(dayKey(first.weeks[0][0])).toBe("2026-11-23");
    expect(first.canPrev).toBe(false);
    expect(first.canNext).toBe(true);
    const next = calendarView(min, end, shiftWeeks(first, 1));
    expect(dayKey(next.weeks[0][0])).toBe("2026-12-28");
    expect(next.canPrev).toBe(true);
    const last = calendarView(min, end, d(2030, 1, 1));
    expect(dayKey(last.weeks[ROLLING_WEEKS - 1][6])).toBe("2027-11-28");
    expect(last.canNext).toBe(false);
  });
});

describe("dayCellState", () => {
  const base = {
    min: d(2026, 11, 28),
    max: d(2026, 12, 4),
    today: d(2026, 11, 28),
    selected: d(2026, 11, 29),
    isClosed: (day: Date) => day.getDay() === 1, // Mondays off
  };

  it("marks past days and days beyond the window as outside", () => {
    expect(dayCellState({ ...base, date: d(2026, 11, 27) })).toMatchObject({ outside: true, enabled: false });
    expect(dayCellState({ ...base, date: d(2026, 12, 5) })).toMatchObject({ outside: true, enabled: false });
  });

  it("marks closed days and keeps them unpickable", () => {
    expect(dayCellState({ ...base, date: d(2026, 11, 30) })).toMatchObject({ closed: true, enabled: false });
  });

  it("shows today, the selection and free dots", () => {
    const hasFree = (day: Date) => day.getDate() !== 1;
    expect(dayCellState({ ...base, hasFree, date: d(2026, 11, 28) })).toMatchObject({ today: true, free: true, enabled: true });
    expect(dayCellState({ ...base, hasFree, date: d(2026, 11, 29) })).toMatchObject({ selected: true });
    // Open but fully booked: no dot, not pickable.
    expect(dayCellState({ ...base, hasFree, date: d(2026, 12, 1) })).toMatchObject({ free: false, enabled: false });
  });

  it("has no dots when availability is unknown", () => {
    expect(dayCellState({ ...base, date: d(2026, 12, 2) })).toMatchObject({ free: null, enabled: true });
  });

  it("mutes neighbouring months in a paged month view", () => {
    const state = dayCellState({ ...base, max: d(2027, 6, 1), date: d(2026, 12, 2), month: d(2026, 11, 1) });
    expect(state.outside).toBe(true);
  });
});

describe("labels", () => {
  it("labels the shown week range in the guest's language", () => {
    expect(weekRangeTitle(d(2026, 11, 23), d(2026, 11, 29), "ru")).toMatch(/^23\s*–\s*29 нояб\.?$/);
    expect(weekRangeTitle(d(2026, 11, 30), d(2026, 12, 6), "ru")).toMatch(/30 нояб\.?\s*–\s*6 дек\.?/);
    expect(weekRangeTitle(d(2026, 11, 23), d(2026, 11, 29), "en")).toMatch(/Nov 23\s*–\s*29/);
    expect(weekRangeTitle(d(2026, 11, 30), d(2026, 12, 6), "ro")).toMatch(/30 nov\.?\s*–\s*6 dec\.?/);
  });

  it("gives two-letter weekday heads from Monday", () => {
    expect(weekdayHeads("en")).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
    expect(weekdayHeads("ru")[0].toLowerCase()).toBe("пн");
    expect(weekdayHeads("ro")[0].toLowerCase()).toBe("lu");
  });
});
