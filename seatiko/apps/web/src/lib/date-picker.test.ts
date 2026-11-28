import { describe, expect, it } from "vitest";
import {
  PICKER_MODE_KEY,
  calendarView,
  dayCellState,
  dayKey,
  monthRangeTitle,
  monthWeeks,
  parseDayKey,
  readPickerMode,
  startOfWeek,
  weekdayHeads,
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
  it("shows a short range as one grid without paging", () => {
    const view = calendarView(d(2026, 11, 28), d(2026, 12, 4), d(2026, 11, 28));
    expect(view.paged).toBe(false);
    expect(view.canPrev || view.canNext).toBe(false);
    expect(view.fromMonth.getMonth()).toBe(10);
    expect(view.toMonth.getMonth()).toBe(11);
  });

  it("pages a long range by month and clamps the anchor", () => {
    const min = d(2026, 11, 28);
    const max = d(2027, 11, 28);
    const first = calendarView(min, max, d(2026, 1, 1));
    expect(first.paged).toBe(true);
    expect(first.fromMonth.getMonth()).toBe(10);
    expect(first.canPrev).toBe(false);
    expect(first.canNext).toBe(true);
    const last = calendarView(min, max, d(2030, 1, 1));
    expect(dayKey(last.fromMonth)).toBe("2027-11-01");
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
  it("titles one month or a range", () => {
    expect(monthRangeTitle(d(2026, 11, 1), d(2026, 11, 1), "en")).toBe("November 2026");
    expect(monthRangeTitle(d(2026, 11, 1), d(2026, 12, 1), "ru")).toBe("Ноябрь – Декабрь 2026");
    expect(monthRangeTitle(d(2026, 12, 1), d(2027, 1, 1), "ro")).toBe("Decembrie 2026 – Ianuarie 2027");
  });

  it("gives two-letter weekday heads from Monday", () => {
    expect(weekdayHeads("en")).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
    expect(weekdayHeads("ru")[0].toLowerCase()).toBe("пн");
    expect(weekdayHeads("ro")[0].toLowerCase()).toBe("lu");
  });
});
