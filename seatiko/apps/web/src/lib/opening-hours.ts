/**
 * Weekly opening hours of a venue, stored by the API as one text line (`hours_text`).
 *
 * The cabinet edits hours day by day and writes a canonical line such as
 * "Пн–Пт 10:00–22:00, Сб–Вс 11:00–01:00, Вс выходной". The API and the booking widget
 * read only the first "HH:MM–HH:MM" of that line (for every day), so the canonical
 * line always starts with the first open day in week order.
 */

/** One day: closed, or open from `open` to `close` (minutes from midnight). */
export type DayHours =
  | { closed: true }
  | {
      closed: false;
      /** 0…1439. */
      open: number;
      /** 0…1439. Not after `open` = closes the next day; equal to `open` = round the clock. */
      close: number;
    };

/** Monday first, 7 entries. */
export type WeekHours = DayHours[];

export const DAY_COUNT = 7;
export const DEFAULT_DAY: DayHours = { closed: false, open: 10 * 60, close: 22 * 60 };

/** Day abbreviations of the canonical stored line (the API's demo data uses Russian). */
const CANONICAL_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const CANONICAL_CLOSED = "выходной";

/** Prefixes of day names in RU / EN / RO (long names included), Monday first. */
const DAY_WORDS: string[][] = [
  ["пн", "пон", "mon", "mo", "lun", "lu"],
  ["вт", "вто", "tue", "tu", "mar", "ma"],
  ["ср", "сре", "wed", "we", "mie", "mi"],
  ["чт", "чет", "thu", "th", "joi", "jo"],
  ["пт", "пят", "fri", "fr", "vin", "vi"],
  ["сб", "суб", "sat", "sa", "sâm", "sam", "sa"],
  ["вс", "вос", "sun", "su", "dum", "du"],
];

const EVERY_DAY = /^(ежедневно|каждый день|без выходных|daily|every day|everyday|zilnic|în fiecare zi|in fiecare zi)$/;
const ROUND_THE_CLOCK = /^(круглосуточно|24\/7|24 часа|24ч|24h|non-?stop|nonstop|open 24 hours|24 de ore)$/;
const CLOSED = /^(выходной|выходные дни|закрыто|не работает|closed|day off|off|închis|inchis|liber|zi liberă|zi libera)$/;
/** Words that may sit between days and times and carry no meaning. */
const FILLER = /^(с|до|по|from|to|de|la|până|pana|și|si|и|and|:|—|–|-)$/;

const pad = (value: number) => String(value).padStart(2, "0");

/** 600 → "10:00"; 1440 → "24:00". */
export function formatClock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "10:00" → 600; "24:00" → 0 (midnight); invalid → null. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0)) return null;
  return (hours * 60 + minutes) % (24 * 60);
}

export const isRoundTheClock = (day: DayHours) => !day.closed && day.open === day.close;
/** Closes after midnight (a close at exactly 00:00 is "until midnight", not the next day). */
export const closesNextDay = (day: DayHours) => !day.closed && day.close < day.open && day.close !== 0;

const sameDay = (a: DayHours, b: DayHours) =>
  a.closed === b.closed && (a.closed || b.closed || (a.open === b.open && a.close === b.close));

function dayIndex(word: string): number | null {
  for (let index = 0; index < DAY_COUNT; index += 1) {
    if (DAY_WORDS[index].some((prefix) => word === prefix || (prefix.length >= 3 && word.startsWith(prefix)))) {
      return index;
    }
  }
  return null;
}

type Token =
  | { kind: "days"; days: number[] }
  | { kind: "range"; open: number; close: number }
  | { kind: "closed" }
  | { kind: "always" };

function rangeDays(from: number, to: number): number[] {
  const days: number[] = [];
  for (let step = 0, day = from; step < DAY_COUNT; step += 1, day = (day + 1) % DAY_COUNT) {
    days.push(day);
    if (day === to) break;
  }
  return days;
}

/** Splits a line into day lists, time ranges and closed / 24h markers; null when a part is not understood. */
function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  let rest = text
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const patterns: [RegExp, (match: RegExpExecArray) => Token | null][] = [
    [/^(\d{1,2}[:.]\d{2})\s*(?:-|до|to|până la|pana la|la)\s*(\d{1,2}[:.]\d{2})/, (m) => {
      const open = parseClock(m[1]);
      const close = parseClock(m[2]);
      if (open === null || close === null) return null;
      // "00:00–24:00" and "10:00–10:00" both mean round the clock.
      return open === close ? { kind: "always" } : { kind: "range", open, close };
    }],
    [/^(ежедневно|каждый день|без выходных|daily|every ?day|zilnic|[îi]n fiecare zi)/, () => ({ kind: "days", days: rangeDays(0, 6) })],
    [/^(круглосуточно|24\/7|24 часа|24ч|24h|non-?stop|open 24 hours|24 de ore)/, () => ({ kind: "always" })],
    [/^(выходной|выходные дни|закрыто|не работает|closed|day off|off\b|[îi]nchis|liber[ăa]?|zi liber[ăa])/, () => ({ kind: "closed" })],
    [/^([a-zа-яăâîșşțţ]+)\.?\s*-\s*([a-zа-яăâîșşțţ]+)\.?/, (m) => {
      const from = dayIndex(m[1]);
      const to = dayIndex(m[2]);
      return from === null || to === null ? null : { kind: "days", days: rangeDays(from, to) };
    }],
    [/^([a-zа-яăâîșşțţ]+)\.?/, (m) => {
      const day = dayIndex(m[1]);
      if (day !== null) return { kind: "days", days: [day] };
      return FILLER.test(m[1]) ? { kind: "days", days: [] } : null;
    }],
  ];
  while (rest) {
    const separator = /^[\s,;|/:]+/.exec(rest);
    if (separator) {
      rest = rest.slice(separator[0].length);
      continue;
    }
    let matched = false;
    for (const [pattern, build] of patterns) {
      const match = pattern.exec(rest);
      if (!match) continue;
      const token = build(match);
      if (!token) return null;
      if (!(token.kind === "days" && token.days.length === 0)) tokens.push(token);
      rest = rest.slice(match[0].length);
      matched = true;
      break;
    }
    if (!matched) {
      const filler = /^(\S+)/.exec(rest);
      if (filler && FILLER.test(filler[1])) {
        rest = rest.slice(filler[1].length);
        continue;
      }
      return null;
    }
  }
  return tokens;
}

/**
 * Reads a stored line ("Пн–Вс 10:00–23:00", "Mon-Fri 09:00-18:00, Sat 10:00-16:00, Sun closed",
 * "Lun–Dum 12:00–01:00", "круглосуточно"). Days the line does not mention are closed.
 * Returns null for an empty line or one the editor cannot represent (two ranges a day, free text).
 */
export function parseHoursText(text: string | null | undefined): WeekHours | null {
  const source = (text ?? "").trim();
  if (!source) return null;
  const whole = source.toLowerCase();
  if (ROUND_THE_CLOCK.test(whole)) return Array.from({ length: DAY_COUNT }, () => ({ closed: false, open: 0, close: 0 }));
  if (EVERY_DAY.test(whole) || CLOSED.test(whole)) return null;
  const tokens = tokenize(source);
  if (!tokens || tokens.length === 0) return null;

  const week: (DayHours | null)[] = Array.from({ length: DAY_COUNT }, () => null);
  let pending: number[] = [];
  let lastDays: number[] = [];
  const assign = (value: DayHours) => {
    const days = pending.length ? pending : lastDays.length ? null : rangeDays(0, 6);
    if (!days) return false;
    for (const day of days) {
      if (week[day] !== null) return false; // a day twice = two ranges a day or a contradiction
      week[day] = value;
    }
    lastDays = days;
    pending = [];
    return true;
  };
  for (const token of tokens) {
    if (token.kind === "days") {
      for (const day of token.days) if (!pending.includes(day)) pending.push(day);
      continue;
    }
    const value: DayHours =
      token.kind === "closed"
        ? { closed: true }
        : token.kind === "always"
          ? { closed: false, open: 0, close: 0 }
          : { closed: false, open: token.open, close: token.close };
    if (!assign(value)) return null;
  }
  if (pending.length) return null;
  const days = week.map((day) => day ?? ({ closed: true } as DayHours));
  return days.some((day) => !day.closed) ? days : null;
}

/** Consecutive days with the same hours, Monday first. */
export function groupDays(week: WeekHours): { from: number; to: number; hours: DayHours }[] {
  const groups: { from: number; to: number; hours: DayHours }[] = [];
  week.forEach((day, index) => {
    const last = groups[groups.length - 1];
    if (last && last.to === index - 1 && sameDay(last.hours, day)) last.to = index;
    else groups.push({ from: index, to: index, hours: day });
  });
  return groups;
}

function rangeText(day: DayHours): string {
  if (day.closed) return CANONICAL_CLOSED;
  if (isRoundTheClock(day)) return "00:00–24:00";
  return `${formatClock(day.open)}–${formatClock(day.close)}`;
}

/** The canonical stored line; "" when every day is closed. */
export function formatHoursText(week: WeekHours): string {
  if (week.every((day) => day.closed)) return "";
  return groupDays(week)
    .map(({ from, to, hours }) => {
      const days = from === to ? CANONICAL_DAYS[from] : `${CANONICAL_DAYS[from]}–${CANONICAL_DAYS[to]}`;
      return `${days} ${rangeText(hours)}`;
    })
    .join(", ");
}

export type HoursLabels = {
  /** Short day names, Monday first. */
  days: string[];
  closed: string;
  roundTheClock: string;
  everyDay: string;
};

/** Human summary in the viewer's language: "Пн–Пт 10:00–22:00 · Сб–Вс 11:00–01:00". */
export function describeHours(week: WeekHours, labels: HoursLabels): string {
  const groups = groupDays(week);
  if (groups.length === 1 && !groups[0].hours.closed) {
    const hours = groups[0].hours;
    return `${labels.everyDay} ${isRoundTheClock(hours) ? labels.roundTheClock : rangeText(hours)}`;
  }
  return groups
    .map(({ from, to, hours }) => {
      const days = from === to ? labels.days[from] : `${labels.days[from]}–${labels.days[to]}`;
      const value = hours.closed
        ? labels.closed
        : isRoundTheClock(hours)
          ? labels.roundTheClock
          : rangeText(hours);
      return `${days} ${value}`;
    })
    .join(" · ");
}

/** True when days differ or some day is closed: online booking still uses the first range for every day. */
export function hoursVaryByDay(week: WeekHours): boolean {
  return groupDays(week).length > 1;
}

/** What the API and the booking widget read from the line: its first "HH:MM–HH:MM". */
export function bookingRange(text: string): string | null {
  const match = /(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(text);
  return match ? `${pad(Number(match[1]))}:${match[2]}–${pad(Number(match[3]))}:${match[4]}` : null;
}

export function defaultWeek(): WeekHours {
  return Array.from({ length: DAY_COUNT }, () => ({ ...DEFAULT_DAY }));
}
