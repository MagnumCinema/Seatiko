/**
 * Day picker logic shared by the booking popup and the banquet form:
 * "Cards | Calendar" mode (remembered per browser), week grids and day states.
 * All dates are local calendar days (time of day ignored).
 */

export type PickerMode = "cards" | "calendar";
export const PICKER_MODE_KEY = "seatiko_date_picker_mode";
/** A short range (e.g. the 7-day booking window) is shown as one grid of whole weeks. */
export const SINGLE_GRID_MAX_WEEKS = 6;

export function readPickerMode(storage: Pick<Storage, "getItem"> | null = safeStorage()): PickerMode {
  try {
    return storage?.getItem(PICKER_MODE_KEY) === "calendar" ? "calendar" : "cards";
  } catch {
    return "cards";
  }
}

export function writePickerMode(mode: PickerMode, storage: Pick<Storage, "setItem"> | null = safeStorage()) {
  try {
    storage?.setItem(PICKER_MODE_KEY, mode);
  } catch {
    /* private mode / storage blocked: the choice lasts until reload */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "2026-11-28": stable key of a local day. */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Monday-first week start (weekStartsOn 1) or Sunday-first (0). */
export function startOfWeek(d: Date, weekStartsOn: 0 | 1 = 1): Date {
  const day = startOfDay(d);
  const shift = (day.getDay() - weekStartsOn + 7) % 7;
  return addDays(day, -shift);
}

/** Whole weeks from the week of `from` through the week of `to`. */
export function weeksBetween(from: Date, to: Date, weekStartsOn: 0 | 1 = 1): Date[][] {
  const weeks: Date[][] = [];
  let cursor = startOfWeek(from, weekStartsOn);
  const last = startOfDay(to);
  while (cursor.getTime() <= last.getTime()) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** Whole weeks covering a calendar month (4–6 rows). */
export function monthWeeks(month: Date, weekStartsOn: 0 | 1 = 1): Date[][] {
  const first = monthStart(month);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return weeksBetween(first, last, weekStartsOn);
}

export type CalendarView = {
  weeks: Date[][];
  /** First and last month the grid is about (for the title "Ноябрь – Декабрь 2026"). */
  fromMonth: Date;
  toMonth: Date;
  /** Month paging (long ranges only). */
  paged: boolean;
  canPrev: boolean;
  canNext: boolean;
};

/**
 * What the calendar grid shows: a short range (≤ 6 weeks, like the 7-day booking window)
 * as one grid across months; a long range (banquet dates a year ahead) month by month.
 */
export function calendarView(min: Date, max: Date, anchor: Date, weekStartsOn: 0 | 1 = 1): CalendarView {
  const span = weeksBetween(min, max, weekStartsOn);
  if (span.length <= SINGLE_GRID_MAX_WEEKS) {
    return {
      weeks: span,
      fromMonth: monthStart(min),
      toMonth: monthStart(max),
      paged: false,
      canPrev: false,
      canNext: false,
    };
  }
  const month = clampMonth(anchor, min, max);
  return {
    weeks: monthWeeks(month, weekStartsOn),
    fromMonth: month,
    toMonth: month,
    paged: true,
    canPrev: month.getTime() > monthStart(min).getTime(),
    canNext: month.getTime() < monthStart(max).getTime(),
  };
}

export function clampMonth(anchor: Date, min: Date, max: Date): Date {
  const month = monthStart(anchor);
  if (month.getTime() < monthStart(min).getTime()) return monthStart(min);
  if (month.getTime() > monthStart(max).getTime()) return monthStart(max);
  return month;
}

export type DayCellState = {
  key: string;
  date: Date;
  /** Outside the bookable range (past, beyond the window) or not part of the paged month. */
  outside: boolean;
  /** The venue does not open that day. */
  closed: boolean;
  /** Something is free that day (green dot); null when unknown. */
  free: boolean | null;
  today: boolean;
  selected: boolean;
  /** Can be picked. */
  enabled: boolean;
};

export function dayCellState({
  date,
  min,
  max,
  today,
  selected,
  isClosed,
  hasFree,
  month,
}: {
  date: Date;
  min: Date;
  max: Date;
  today: Date;
  selected: Date | null;
  isClosed: (d: Date) => boolean;
  /** undefined: availability is not known for this picker (no dots). */
  hasFree?: (d: Date) => boolean;
  /** Paged month view: days of the neighbouring months are shown muted. */
  month?: Date;
}): DayCellState {
  const day = startOfDay(date);
  const inRange = day.getTime() >= startOfDay(min).getTime() && day.getTime() <= startOfDay(max).getTime();
  const inMonth = !month || (day.getMonth() === month.getMonth() && day.getFullYear() === month.getFullYear());
  const outside = !inRange || !inMonth;
  const closed = !outside && isClosed(day);
  const free = hasFree && !outside && !closed ? hasFree(day) : null;
  return {
    key: dayKey(day),
    date: day,
    outside,
    closed,
    free,
    today: sameDay(day, today),
    selected: !!selected && sameDay(day, selected),
    enabled: !outside && !closed && free !== false,
  };
}

/** "Ноябрь 2026", "Ноябрь – Декабрь 2026", "Декабрь 2026 – Январь 2027". */
export function monthRangeTitle(from: Date, to: Date, locale: string): string {
  const name = (d: Date) => capitalize(new Intl.DateTimeFormat(locale, { month: "long" }).format(d));
  if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
    return `${name(from)} ${from.getFullYear()}`;
  }
  if (from.getFullYear() === to.getFullYear()) return `${name(from)} – ${name(to)} ${to.getFullYear()}`;
  return `${name(from)} ${from.getFullYear()} – ${name(to)} ${to.getFullYear()}`;
}

/** Two-letter weekday heads, Monday first: ПН ВТ … / MO TU … / LU MA … */
export function weekdayHeads(locale: string, weekStartsOn: 0 | 1 = 1): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(2024, 0, 1 + ((i + weekStartsOn - 1 + 7) % 7));
    return format.format(date).replace(/\.$/, "").slice(0, 2);
  });
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}
