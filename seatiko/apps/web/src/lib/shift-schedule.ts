/**
 * Shift scheduling rules shared by every planner view (week grid, day view, assign/edit,
 * swap, copy week, pattern generator) and the staff page.
 *
 * Model: a shift belongs to a work date (YYYY-MM-DD, venue-local) and has HH:MM start/end.
 * An end at or before the start runs into the next day (overnight). Real instants come
 * from the venue time zone (Europe/Chisinau), so durations, overlaps and rest are right
 * across midnight and on DST nights. Everything here is pure: no React, no API, no clock
 * unless one is passed in.
 */
import type { WorkShift } from "@/lib/api";

export const VENUE_TIME_ZONE = "Europe/Chisinau";
/** Daily rest between two work days (Moldova Labour Code art. 107: 11 consecutive hours). */
export const MIN_REST_MINUTES = 11 * 60;
/** Longer shifts get a warning. */
export const LONG_SHIFT_MINUTES = 12 * 60;
/** Normal working week; more planned hours get a warning. */
export const WEEK_LIMIT_MINUTES = 40 * 60;
/** Generators never plan more work days in a row than this. */
export const MAX_DAYS_IN_A_ROW = 6;
/** Prep before opening / cleanup after closing that is still normal. */
export const HOURS_BUFFER_MINUTES = 120;

const DAY_MIN = 24 * 60;
const MINUTE_MS = 60_000;

const mod = (a: number, n: number) => ((a % n) + n) % n;

export type ShiftStatus = WorkShift["status"];

/** Any shift-shaped value: a saved shift or a draft that is not saved yet (no id, no status). */
export type ShiftLike = {
  id?: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status?: ShiftStatus;
  role?: string;
  staff_name?: string;
  note?: string;
};

export type ShiftDraft = {
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  role?: string;
  note?: string;
};

/* ------------------------------------------------------------------ dates */

function splitDate(date: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return [y, mo, d];
}

export const isValidDate = (date: string) => splitDate(date) !== null;

const dayCache = new Map<string, number>();

/** Midnight UTC of a date string (cached: generators compare dates many times). */
const utcDay = (date: string) => {
  let v = dayCache.get(date);
  if (v === undefined) {
    const p = splitDate(date);
    v = p ? Date.UTC(p[0], p[1] - 1, p[2]) : NaN;
    if (dayCache.size > 20_000) dayCache.clear();
    dayCache.set(date, v);
  }
  return v;
};

const fromUtcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Calendar arithmetic on YYYY-MM-DD strings (no local time zone involved). */
export function addDays(date: string, days: number): string {
  return fromUtcDay(utcDay(date) + days * 86_400_000);
}

/** Whole days from `from` to `to`. */
export const dayDiff = (from: string, to: string) => Math.round((utcDay(to) - utcDay(from)) / 86_400_000);

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const wd = new Date(utcDay(date)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Monday of the week the date is in. */
export const weekStart = (date: string) => addDays(date, 1 - isoWeekday(date));

/** The same day `months` later; the 31st becomes the month's last day. */
export function addMonths(date: string, months: number): string {
  const p = splitDate(date);
  if (!p) return date;
  const total = p[0] * 12 + (p[1] - 1) + months;
  const y = Math.floor(total / 12);
  const mo = total - y * 12;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return fromUtcDay(Date.UTC(y, mo, Math.min(p[2], last)));
}

/** First and last day of the date's month. */
export function monthBounds(date: string): { start: string; end: string } {
  const start = `${date.slice(0, 7)}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

/** Every date from `start` to `end`, both included. */
export function datesBetween(start: string, end: string): string[] {
  const n = dayDiff(start, end);
  if (!(n >= 0)) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
}

/* ------------------------------------------------------------------ times */

/** "HH:MM" (or legacy "9:5") → minutes from midnight, else null. */
export function parseTime(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec((hhmm || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes (any day offset) → "HH:MM" on a 24 h clock. */
export function formatTime(minutes: number): string {
  const m = ((Math.round(minutes) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Always two-digit "HH:MM" for display ("9:5" → "09:05"); unreadable values stay as they are. */
export function normalizeTime(hhmm: string): string {
  const m = parseTime(hhmm);
  return m === null ? hhmm : formatTime(m);
}

/** End at or before the start = the shift ends the next day. */
export function isOvernight(start: string, end: string): boolean {
  const s = parseTime(start);
  const e = parseTime(end);
  return s !== null && e !== null && e <= s;
}

/** Why hours cannot be saved: unreadable, or zero length (end equals start). */
export function timesProblem(start: string, end: string): "invalid_time" | "zero_length" | null {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null) return "invalid_time";
  if (s === e) return "zero_length";
  return null;
}

/** Clock length in minutes (overnight wraps; equal times count as 24 h like the API). */
export function clockMinutes(start: string, end: string): number {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null) return 0;
  const d = e - s;
  return d <= 0 ? d + DAY_MIN : d;
}

/* -------------------------------------------------------------- time zone */

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(tz: string) {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a time zone. */
function zonedParts(epochMs: number, tz: string) {
  const parts: Record<string, number> = {};
  for (const p of offsetFormatter(tz).formatToParts(new Date(epochMs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** UTC offset of the zone at an instant, in minutes (Chisinau: +120 winter, +180 summer). */
export function zoneOffsetMinutes(epochMs: number, tz = VENUE_TIME_ZONE): number {
  const p = zonedParts(epochMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / MINUTE_MS);
}

const zonedCache = new Map<string, number>();

/**
 * Instant of a venue-local date + minute of day. A time skipped by the spring DST jump
 * moves forward by the jump (03:30 → 04:30), like Temporal's "compatible".
 */
export function zonedEpochMs(date: string, minuteOfDay: number, tz = VENUE_TIME_ZONE): number {
  const key = `${tz}|${date}|${minuteOfDay}`;
  const cached = zonedCache.get(key);
  if (cached !== undefined) return cached;
  const guess = utcDay(date) + minuteOfDay * MINUTE_MS;
  const off1 = zoneOffsetMinutes(guess, tz);
  let t = guess - off1 * MINUTE_MS;
  const off2 = zoneOffsetMinutes(t, tz);
  if (off2 !== off1) t = guess - off2 * MINUTE_MS;
  if (zonedCache.size > 20_000) zonedCache.clear();
  zonedCache.set(key, t);
  return t;
}

/** Venue-local date and minute of day for an instant. */
export function zonedNow(now: Date, tz = VENUE_TIME_ZONE): { date: string; minutes: number } {
  const p = zonedParts(now.getTime(), tz);
  const date = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { date, minutes: p.hour * 60 + p.minute };
}

export const todayInZone = (now: Date, tz = VENUE_TIME_ZONE) => zonedNow(now, tz).date;

/** Instant of a minute counted from the date's midnight (may run into the next days). */
const localInstant = (date: string, minutes: number, tz: string) =>
  zonedEpochMs(addDays(date, Math.floor(minutes / DAY_MIN)), mod(minutes, DAY_MIN), tz);

/* ----------------------------------------------------------------- spans */

export type ShiftSpan = {
  /** Instants in ms. */
  start: number;
  end: number;
  /** Real length (DST-aware). */
  minutes: number;
  overnight: boolean;
};

/** Real start/end of a shift, or null when its date or times cannot be read. */
export function shiftSpan(s: Pick<ShiftLike, "date" | "start_time" | "end_time">, tz = VENUE_TIME_ZONE): ShiftSpan | null {
  const st = parseTime(s.start_time);
  const en = parseTime(s.end_time);
  if (st === null || en === null || !isValidDate(s.date)) return null;
  const overnight = en <= st;
  const start = zonedEpochMs(s.date, st, tz);
  const end = zonedEpochMs(overnight ? addDays(s.date, 1) : s.date, en, tz);
  return { start, end, minutes: Math.round((end - start) / MINUTE_MS), overnight };
}

/** Real length in minutes (a 22:00–06:00 night is 7 h in March and 9 h in October). */
export const shiftMinutes = (s: Pick<ShiftLike, "date" | "start_time" | "end_time">, tz = VENUE_TIME_ZONE) =>
  shiftSpan(s, tz)?.minutes ?? 0;

/* ---------------------------------------------------------------- status */

/** Holds the person's time: confirmed, waiting for an answer, or asked for a swap but not replaced yet. */
export const occupiesTime = (s: Pick<ShiftLike, "status">) => s.status !== "DECLINED";

/** Counts toward coverage: will most likely be worked (declined and swap-requested shifts do not). */
export const countsForCoverage = (s: Pick<ShiftLike, "status">) =>
  s.status === undefined || s.status === "PENDING" || s.status === "CONFIRMED";

/* ---------------------------------------------------------------- people */

export type PersonOf = (staffId: string) => string;

/**
 * One person can hold two memberships at a venue (invited twice with different roles).
 * They share a key (account, else e-mail) so their shifts are checked together.
 */
export function personIndex(staff: { id: string; email?: string; user_id?: string }[]): PersonOf {
  const map = new Map<string, string>();
  for (const m of staff) {
    const key = m.user_id ? `u:${m.user_id}` : m.email ? `e:${m.email.trim().toLowerCase()}` : `s:${m.id}`;
    map.set(m.id, key);
  }
  // Memberships linked by account and by e-mail with the same person join under one key.
  const byEmail = new Map<string, string>();
  for (const m of staff) {
    if (!m.email) continue;
    const email = m.email.trim().toLowerCase();
    const known = byEmail.get(email);
    if (known) map.set(m.id, known);
    else byEmail.set(email, map.get(m.id)!);
  }
  return (id) => map.get(id) ?? `s:${id}`;
}

const samePerson = (personOf: PersonOf | undefined, a: string, b: string) =>
  a === b || (personOf ? personOf(a) === personOf(b) : false);

/* -------------------------------------------------------------- conflicts */

export type OpeningHours = { open: number; close: number };

export type ScheduleContext = {
  tz?: string;
  /** "Now" for ended/started checks; leave out to skip them. */
  now?: Date;
  personOf?: PersonOf;
  minRestMinutes?: number;
  hours?: OpeningHours | null;
  /** Saved shifts to leave out (the one being edited or replaced). */
  ignoreIds?: ReadonlySet<string>;
};

export type ShiftIssue =
  | { code: "invalid_time" }
  | { code: "zero_length" }
  | { code: "ended" }
  | { code: "overlap"; shift: ShiftLike }
  | { code: "duplicate"; shift: ShiftLike }
  | { code: "started" }
  | { code: "short_rest"; shift: ShiftLike; restMinutes: number }
  | { code: "long_shift"; minutes: number }
  | { code: "outside_hours"; open: number; close: number }
  | { code: "too_many_days"; days: number };

const ignored = (s: ShiftLike, ctx: ScheduleContext) => Boolean(s.id && ctx.ignoreIds?.has(s.id));

/** Saved shifts of the same person that hold time and are near enough to touch the draft's dates. */
function neighbours<T extends ShiftLike>(draft: ShiftLike, existing: readonly T[], ctx: ScheduleContext): T[] {
  return existing.filter(
    (s) =>
      samePerson(ctx.personOf, s.staff_id, draft.staff_id) &&
      s !== draft &&
      occupiesTime(s) &&
      !ignored(s, ctx) &&
      Math.abs(dayDiff(s.date, draft.date)) <= 1,
  );
}

/** Shifts of the same person whose real time intersects the draft (also across midnight). */
export function overlappingShifts<T extends ShiftLike>(draft: ShiftLike, existing: readonly T[], ctx: ScheduleContext = {}): T[] {
  const tz = ctx.tz ?? VENUE_TIME_ZONE;
  const span = shiftSpan(draft, tz);
  if (!span) return [];
  return neighbours(draft, existing, ctx).filter((s) => {
    const other = shiftSpan(s, tz);
    // An unreadable saved shift blocks its own date, so bad data is never silently doubled.
    if (!other) return s.date === draft.date;
    return span.start < other.end && other.start < span.end;
  });
}

const sameHours = (a: ShiftLike, b: ShiftLike) =>
  a.date === b.date && normalizeTime(a.start_time) === normalizeTime(b.start_time) && normalizeTime(a.end_time) === normalizeTime(b.end_time);

/**
 * Rest shorter than the minimum between the draft and the person's shifts of other work days.
 * Parts of a split shift (same date) are one work day: they only must not overlap.
 */
export function restConflicts<T extends ShiftLike>(
  draft: ShiftLike,
  existing: readonly T[],
  ctx: ScheduleContext = {},
): { shift: T; restMinutes: number }[] {
  const tz = ctx.tz ?? VENUE_TIME_ZONE;
  const minRest = ctx.minRestMinutes ?? MIN_REST_MINUTES;
  const span = shiftSpan(draft, tz);
  if (!span) return [];
  const out: { shift: T; restMinutes: number }[] = [];
  for (const s of existing) {
    if (s === draft || !occupiesTime(s) || ignored(s, ctx) || s.date === draft.date) continue;
    if (!samePerson(ctx.personOf, s.staff_id, draft.staff_id) || Math.abs(dayDiff(s.date, draft.date)) > 2) continue;
    const other = shiftSpan(s, tz);
    if (!other) continue;
    const gap = other.end <= span.start ? span.start - other.end : span.end <= other.start ? other.start - span.end : -1;
    if (gap < 0) continue; // overlapping: reported as an overlap instead
    const rest = Math.round(gap / MINUTE_MS);
    if (rest < minRest) out.push({ shift: s, restMinutes: rest });
  }
  return out.sort((a, b) => a.restMinutes - b.restMinutes);
}

/** Opening hours from the venue's text ("Пн–Вс 10:00–23:00", "12:00–01:00"); null when none. */
export function parseHoursText(text: string | null | undefined): OpeningHours | null {
  const m = (text || "").match(/(\d{1,2})[:.](\d{2})\s*[–—-]\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const open = Number(m[1]) * 60 + Number(m[2]);
  let close = Number(m[3]) * 60 + Number(m[4]);
  if (open >= DAY_MIN || close > DAY_MIN) return null;
  if (close <= open) close += DAY_MIN;
  return { open, close };
}

/** The shift starts well before opening or ends well after closing (beyond prep/cleanup time). */
export function outsideHours(start: string, end: string, hours: OpeningHours, buffer = HOURS_BUFFER_MINUTES): boolean {
  const s = parseTime(start);
  if (s === null) return false;
  const e = s + clockMinutes(start, end);
  // A shift starting after midnight belongs to the previous evening when the venue works past midnight.
  const from = hours.close > DAY_MIN && s < hours.open && s + DAY_MIN < hours.close ? s + DAY_MIN : s;
  const to = from + (e - s);
  return from < hours.open - buffer || to > hours.close + buffer;
}

/** Work days in a row ending or passing through `date` (dates = days the person works). */
export function daysInARow(workDates: ReadonlySet<string>, date: string): number {
  if (!workDates.has(date)) return 0;
  let n = 1;
  for (let d = addDays(date, -1); workDates.has(d); d = addDays(d, -1)) n++;
  for (let d = addDays(date, 1); workDates.has(d); d = addDays(d, 1)) n++;
  return n;
}

/**
 * Everything wrong with one shift against the saved schedule. Blocking: unreadable or
 * zero-length hours, already over, overlap or duplicate. Warnings: started, short rest,
 * longer than 12 h, far outside opening hours.
 */
export function checkShift(
  draft: ShiftLike,
  existing: readonly ShiftLike[],
  ctx: ScheduleContext = {},
): { blocking: ShiftIssue[]; warnings: ShiftIssue[] } {
  const blocking: ShiftIssue[] = [];
  const warnings: ShiftIssue[] = [];
  const problem = timesProblem(draft.start_time, draft.end_time);
  if (problem || !isValidDate(draft.date)) {
    blocking.push({ code: problem ?? "invalid_time" });
    return { blocking, warnings };
  }
  const tz = ctx.tz ?? VENUE_TIME_ZONE;
  const span = shiftSpan(draft, tz)!;
  if (ctx.now) {
    const now = ctx.now.getTime();
    if (span.end <= now) blocking.push({ code: "ended" });
    else if (span.start < now) warnings.push({ code: "started" });
  }
  for (const s of overlappingShifts(draft, existing, ctx)) {
    blocking.push({ code: sameHours(s, draft) && s.staff_id === draft.staff_id ? "duplicate" : "overlap", shift: s });
  }
  for (const r of restConflicts(draft, existing, ctx)) warnings.push({ code: "short_rest", shift: r.shift, restMinutes: r.restMinutes });
  if (span.minutes > LONG_SHIFT_MINUTES) warnings.push({ code: "long_shift", minutes: span.minutes });
  if (ctx.hours && outsideHours(draft.start_time, draft.end_time, ctx.hours)) {
    warnings.push({ code: "outside_hours", open: ctx.hours.open, close: ctx.hours.close });
  }
  return { blocking, warnings };
}

/* ---------------------------------------------------------------- batches */

export type PlannedShift = { draft: ShiftDraft; warnings: ShiftIssue[]; filled?: boolean };
export type SkippedShift = { draft: ShiftDraft; reason: ShiftIssue };

/**
 * Checks drafts one by one against the saved shifts and the drafts already accepted, so a
 * batch can never overlap itself. `strictRest` also skips drafts that break the rest time
 * (generators); otherwise short rest is only a warning.
 */
export function planShifts(
  drafts: readonly ShiftDraft[],
  existing: readonly ShiftLike[],
  ctx: ScheduleContext = {},
  opts: { strictRest?: boolean; maxDaysInARow?: number } = {},
): { accepted: PlannedShift[]; skipped: SkippedShift[] } {
  const pool: ShiftLike[] = [...existing];
  const accepted: PlannedShift[] = [];
  const skipped: SkippedShift[] = [];
  for (const draft of drafts) {
    const { blocking, warnings } = checkShift(draft, pool, ctx);
    const rest = warnings.find((w) => w.code === "short_rest");
    let reason: ShiftIssue | undefined = blocking[0] ?? (opts.strictRest ? rest : undefined);
    if (!reason && opts.maxDaysInARow) {
      const days = workDatesOf(pool, draft.staff_id, ctx.personOf);
      days.add(draft.date);
      const run = daysInARow(days, draft.date);
      if (run > opts.maxDaysInARow) reason = { code: "too_many_days", days: run };
    }
    if (reason) {
      skipped.push({ draft, reason });
      continue;
    }
    accepted.push({ draft, warnings });
    pool.push({ ...draft, status: "PENDING" });
  }
  return { accepted, skipped };
}

/** Dates a person has shifts that hold time. */
export function workDatesOf(shifts: readonly ShiftLike[], staffId: string, personOf?: PersonOf): Set<string> {
  const out = new Set<string>();
  for (const s of shifts) if (occupiesTime(s) && samePerson(personOf, s.staff_id, staffId)) out.add(s.date);
  return out;
}

/**
 * Batch requests for exactly these drafts. The API takes staff × dates with one time range,
 * so drafts are grouped by hours and note, then people with the same dates share a request.
 */
export function groupForBatch(drafts: readonly ShiftDraft[]): { staff_ids: string[]; dates: string[]; start_time: string; end_time: string; note?: string }[] {
  const byHours = new Map<string, Map<string, Set<string>>>();
  for (const d of drafts) {
    const key = `${d.start_time}|${d.end_time}|${d.note ?? ""}`;
    const people = byHours.get(key) ?? new Map<string, Set<string>>();
    const dates = people.get(d.staff_id) ?? new Set<string>();
    dates.add(d.date);
    people.set(d.staff_id, dates);
    byHours.set(key, people);
  }
  const out: { staff_ids: string[]; dates: string[]; start_time: string; end_time: string; note?: string }[] = [];
  for (const [key, people] of byHours) {
    const [start_time, end_time, note] = key.split("|");
    const byDates = new Map<string, string[]>();
    for (const [staffId, dates] of people) {
      const sig = [...dates].sort().join(",");
      byDates.set(sig, [...(byDates.get(sig) ?? []), staffId]);
    }
    for (const [sig, staff_ids] of byDates) {
      out.push({ staff_ids, dates: sig.split(","), start_time, end_time, ...(note ? { note } : {}) });
    }
  }
  return out;
}

/* ----------------------------------------------------------------- totals */

export type StaffTotals = { shifts: number; minutes: number };

/** Shifts and real hours per staff member for work dates in [from, to] (declined left out). */
export function totalsByStaff(shifts: readonly ShiftLike[], from: string, to: string, tz = VENUE_TIME_ZONE): Map<string, StaffTotals> {
  const out = new Map<string, StaffTotals>();
  for (const s of shifts) {
    if (!occupiesTime(s) || s.date < from || s.date > to) continue;
    const cur = out.get(s.staff_id) ?? { shifts: 0, minutes: 0 };
    cur.shifts += 1;
    cur.minutes += shiftMinutes(s, tz);
    out.set(s.staff_id, cur);
  }
  return out;
}

/** Saved shifts that break the rules with each other (legacy data or other devices): id → issue. */
export function scheduleProblems(
  shifts: readonly ShiftLike[],
  ctx: ScheduleContext = {},
): Map<string, { overlap: ShiftLike[]; shortRest: { shift: ShiftLike; restMinutes: number }[]; zeroLength: boolean }> {
  const out = new Map<string, { overlap: ShiftLike[]; shortRest: { shift: ShiftLike; restMinutes: number }[]; zeroLength: boolean }>();
  const byPerson = new Map<string, ShiftLike[]>();
  for (const s of shifts) {
    if (!occupiesTime(s) || !s.id) continue;
    const key = ctx.personOf ? ctx.personOf(s.staff_id) : s.staff_id;
    byPerson.set(key, [...(byPerson.get(key) ?? []), s]);
  }
  for (const list of byPerson.values()) {
    for (const s of list) {
      const overlap = overlappingShifts(s, list, { ...ctx, ignoreIds: new Set([s.id!]) });
      const shortRest = restConflicts(s, list, { ...ctx, ignoreIds: new Set([s.id!]) });
      const zeroLength = timesProblem(s.start_time, s.end_time) !== null;
      if (overlap.length || shortRest.length || zeroLength) out.set(s.id!, { overlap, shortRest, zeroLength });
    }
  }
  return out;
}

/* --------------------------------------------------------------- staffing */

/**
 * Minimum staffing of a role: "on these weekdays, at least `min` people".
 * Without `from`/`to` it is a whole-day rule (people with a shift that day); with them,
 * at least `min` people must be on shift at every moment of [from, to) — e.g. morning 1
 * waiter, evening 3 waiters, Fri–Sat evening 4.
 */
export type StaffingRule = { id: string; days: number[]; from?: string; to?: string; min: number };
export type StaffingByRole = Record<string, StaffingRule[]>;

export const STAFFING_MAX = 20;
export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export const isWindowRule = (r: StaffingRule) => parseTime(r.from ?? "") !== null && parseTime(r.to ?? "") !== null && r.from !== r.to;

export const rulesForDate = (rules: readonly StaffingRule[] | undefined, date: string) =>
  (rules ?? []).filter((r) => r.min > 0 && r.days.includes(isoWeekday(date)));

export type CoverageGap = { from: number; to: number; have: number };
export type RuleCoverage = { rule: StaffingRule; need: number; have: number; short: boolean; gaps: CoverageGap[] };

/**
 * How well a rule is met on a date by these shifts (one role's shifts).
 * Window rules give the lowest head count inside the window and the parts below the minimum.
 */
export function ruleCoverage(rule: StaffingRule, date: string, roleShifts: readonly ShiftLike[], tz = VENUE_TIME_ZONE): RuleCoverage {
  const counted = roleShifts.filter(countsForCoverage);
  if (!isWindowRule(rule)) {
    const have = new Set(counted.filter((s) => s.date === date).map((s) => s.staff_id)).size;
    return { rule, need: rule.min, have, short: have < rule.min, gaps: [] };
  }
  const from = parseTime(rule.from!)!;
  let to = parseTime(rule.to!)!;
  if (to <= from) to += DAY_MIN;
  const wStart = localInstant(date, from, tz);
  const windowEnd = localInstant(date, to, tz);
  // Head count changes only at shift edges inside the window.
  const edges = new Set<number>([wStart, windowEnd]);
  const spans: { start: number; end: number; staff: string }[] = [];
  for (const s of counted) {
    if (Math.abs(dayDiff(s.date, date)) > 1) continue;
    const sp = shiftSpan(s, tz);
    if (!sp || sp.end <= wStart || sp.start >= windowEnd) continue;
    spans.push({ start: sp.start, end: sp.end, staff: s.staff_id });
    if (sp.start > wStart) edges.add(sp.start);
    if (sp.end < windowEnd) edges.add(sp.end);
  }
  const points = [...edges].sort((a, b) => a - b);
  let have = Infinity;
  const gaps: CoverageGap[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const people = new Set(spans.filter((s) => s.start <= a && s.end >= b).map((s) => s.staff)).size;
    have = Math.min(have, people);
    if (people < rule.min) {
      const gFrom = from + Math.round((a - wStart) / MINUTE_MS);
      const gTo = from + Math.round((b - wStart) / MINUTE_MS);
      const last = gaps[gaps.length - 1];
      if (last && last.to === gFrom && last.have === people) last.to = gTo;
      else gaps.push({ from: gFrom, to: gTo, have: people });
    }
  }
  if (have === Infinity) have = 0;
  return { rule, need: rule.min, have, short: have < rule.min, gaps };
}

export type RoleDayCoverage = {
  role: string;
  /** People of the role on shift that day (coverage statuses only). */
  people: number;
  /** Highest whole-day minimum that day (0 = none). */
  need: number;
  rules: RuleCoverage[];
  short: boolean;
};

export function roleDayCoverage(
  shifts: readonly ShiftLike[],
  date: string,
  role: string,
  rules: readonly StaffingRule[] | undefined,
  tz = VENUE_TIME_ZONE,
): RoleDayCoverage {
  const roleShifts = shifts.filter((s) => s.role === role && Math.abs(dayDiff(s.date, date)) <= 1);
  const people = new Set(roleShifts.filter((s) => s.date === date && countsForCoverage(s)).map((s) => s.staff_id)).size;
  const active = rulesForDate(rules, date).map((r) => ruleCoverage(r, date, roleShifts, tz));
  const need = Math.max(0, ...active.filter((c) => !isWindowRule(c.rule)).map((c) => c.need));
  return { role, people, need, rules: active, short: active.some((c) => c.short) };
}

export type Shortage = { date: string; role: string; coverage: RuleCoverage };

/** Every rule below its minimum on these dates for these roles. */
export function findShortages(
  shifts: readonly ShiftLike[],
  dates: readonly string[],
  roles: readonly string[],
  staffing: StaffingByRole,
  tz = VENUE_TIME_ZONE,
): Shortage[] {
  const out: Shortage[] = [];
  for (const date of dates) {
    for (const role of roles) {
      for (const c of roleDayCoverage(shifts, date, role, staffing[role], tz).rules) {
        if (c.short) out.push({ date, role, coverage: c });
      }
    }
  }
  return out;
}

/** Days below the minimum per role (for a "3 days without enough cooks" summary). */
export function shortDaysByRole(shortages: readonly Shortage[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of shortages) {
    const days = out.get(s.role) ?? [];
    if (!days.includes(s.date)) days.push(s.date);
    out.set(s.role, days);
  }
  return out;
}

/**
 * People of a role on shift per hour slot of a day: slots start at `fromMin` (may run past
 * midnight, e.g. to 25 * 60). For the day timeline.
 */
export function hourlyHeadcount(
  shifts: readonly ShiftLike[],
  date: string,
  role: string,
  fromMin: number,
  toMin: number,
  tz = VENUE_TIME_ZONE,
): { from: number; to: number; people: number }[] {
  const out: { from: number; to: number; people: number }[] = [];
  const roleShifts = shifts.filter((s) => s.role === role && countsForCoverage(s) && Math.abs(dayDiff(s.date, date)) <= 1);
  const spans = roleShifts.map((s) => ({ span: shiftSpan(s, tz), staff: s.staff_id })).filter((x) => x.span);
  for (let m = fromMin; m < toMin; m += 60) {
    const end = Math.min(m + 60, toMin);
    const a = localInstant(date, m, tz);
    const b = localInstant(date, end, tz);
    const people = new Set(spans.filter((x) => x.span!.start < b && x.span!.end > a).map((x) => x.staff)).size;
    out.push({ from: m, to: end, people });
  }
  return out;
}

/* --------------------------------------------------------------- patterns */

export type Pattern = { kind: "cycle"; on: number; off: number } | { kind: "weekdays"; days: number[] };

export const cycleLength = (p: Extract<Pattern, { kind: "cycle" }>) => p.on + p.off;


/**
 * Does someone in this pattern work on `date`? Cycles count from the anchor date (day 1
 * of team A), so any date range — next week, next month — lands on the same rhythm.
 * `phase` shifts the start (team B of 2/2 = phase 2).
 */
export function worksOn(pattern: Pattern, anchor: string, date: string, phase = 0): boolean {
  if (pattern.kind === "weekdays") return pattern.days.includes(isoWeekday(date));
  return mod(dayDiff(anchor, date) - phase, cycleLength(pattern)) < pattern.on;
}

/**
 * The phase that continues a person's current rhythm, read from the two cycles before
 * `from`: the phase with the fewest mismatching days, if it is the only best one and a few
 * extra days (top-ups to a minimum, one swap) at most break it. Null when there is no
 * clear rhythm.
 */
export function inferPhase(pattern: Extract<Pattern, { kind: "cycle" }>, anchor: string, workDates: ReadonlySet<string>, from: string): number | null {
  const len = cycleLength(pattern);
  const lookback = Array.from({ length: len * 2 }, (_, i) => addDays(from, -len * 2 + i));
  if (!lookback.slice(len).some((d) => workDates.has(d))) return null;
  const mismatches = Array.from({ length: len }, (_, phase) =>
    lookback.filter((d) => worksOn(pattern, anchor, d, phase) !== workDates.has(d)).length,
  );
  const best = Math.min(...mismatches);
  if (best > Math.floor(len / 2) || mismatches.filter((m) => m === best).length > 1) return null;
  return mismatches.indexOf(best);
}

/** Alternate selected people into teams A and B inside each role, so each role works every day. */
export function splitTeams(groups: readonly string[][]): { a: string[]; b: string[] } {
  const a: string[] = [];
  const b: string[] = [];
  for (const ids of groups) ids.forEach((id, i) => (i % 2 === 0 ? a : b).push(id));
  return { a, b };
}

export type TeamMode = "alternate" | "team_a" | "team_b";
export type Interval = { start: string; end: string };

export type GenerateInput = {
  pattern: Pattern;
  /** Day 1 of the cycle for team A. */
  anchor: string;
  from: string;
  to: string;
  intervals: Interval[];
  /** Selected people in planner order (role groups, then names). */
  members: { id: string; role: string }[];
  teamMode: TeamMode;
  /** Keep each person's current rhythm when their last days show one. */
  continueRhythm: boolean;
  /** Add shifts for free people on days a role is below its minimum. */
  fillToMinimum: boolean;
  staffing: StaffingByRole;
  existing: readonly ShiftLike[];
  note?: string;
  ctx: ScheduleContext;
};

export type GenerateResult = {
  accepted: PlannedShift[];
  skipped: SkippedShift[];
  /** Phase used per person and why. */
  phases: Map<string, { phase: number; source: "rhythm" | "team_a" | "team_b" }>;
  filled: number;
  /** Rules still below minimum after generation (roles of the selected people). */
  shortages: Shortage[];
};

/**
 * Builds a stable schedule: pattern days for each person, checked against saved shifts
 * (no overlaps, no duplicates, rest kept, at most MAX_DAYS_IN_A_ROW), then topped up to the
 * role minimums with free people where possible. Nothing is saved here.
 */
export function generatePattern(input: GenerateInput): GenerateResult {
  const { pattern, anchor, from, to, intervals, members, staffing, ctx } = input;
  const tz = ctx.tz ?? VENUE_TIME_ZONE;
  const dates = datesBetween(from, to);
  const phases = new Map<string, { phase: number; source: "rhythm" | "team_a" | "team_b" }>();

  if (pattern.kind === "cycle") {
    const byRole = new Map<string, string[]>();
    for (const m of members) byRole.set(m.role, [...(byRole.get(m.role) ?? []), m.id]);
    const teams = splitTeams([...byRole.values()]);
    const teamB = new Set(input.teamMode === "team_b" ? members.map((m) => m.id) : input.teamMode === "alternate" ? teams.b : []);
    for (const m of members) {
      const rhythm = input.continueRhythm ? inferPhase(pattern, anchor, workDatesOf(input.existing, m.id), from) : null;
      if (rhythm !== null) phases.set(m.id, { phase: rhythm, source: "rhythm" });
      else phases.set(m.id, teamB.has(m.id) ? { phase: pattern.on, source: "team_b" } : { phase: 0, source: "team_a" });
    }
  }

  const opts = { strictRest: true, maxDaysInARow: MAX_DAYS_IN_A_ROW };
  const dayDrafts = (m: { id: string; role: string }, date: string): ShiftDraft[] =>
    intervals.map((iv) => ({ staff_id: m.id, date, start_time: iv.start, end_time: iv.end, role: m.role, ...(input.note ? { note: input.note } : {}) }));
  const accepted: PlannedShift[] = [];
  const skipped: SkippedShift[] = [];
  const pool = (): ShiftLike[] => [...input.existing, ...accepted.map((a) => ({ ...a.draft, status: "PENDING" as const }))];
  // One person's work day (all parts of a split shift) is planned or skipped as a whole.
  const planDay = (m: { id: string; role: string }, date: string, current: readonly ShiftLike[]) => {
    const plan = planShifts(dayDrafts(m, date), current, ctx, opts);
    return plan.skipped.length ? { ok: false as const, skipped: plan.skipped } : { ok: true as const, accepted: plan.accepted };
  };
  for (const date of dates) {
    for (const m of members) {
      if (!worksOn(pattern, anchor, date, phases.get(m.id)?.phase ?? 0)) continue;
      const res = planDay(m, date, pool());
      if (res.ok) accepted.push(...res.accepted);
      else skipped.push(...res.skipped);
    }
  }

  const roles = [...new Set(members.map((m) => m.role))];
  let filled = 0;
  if (input.fillToMinimum) {
    for (const date of dates) {
      for (const role of roles) {
        const candidates = members.filter((m) => m.role === role);
        // Each round adds one free person who improves a rule that is still short.
        for (let round = 0; round < candidates.length; round++) {
          const current = pool();
          const shortRules = roleDayCoverage(current, date, role, staffing[role], tz).rules.filter((r) => r.short);
          if (!shortRules.length) break;
          // Least loaded first, so extra days are shared fairly.
          const load = totalsByStaff(current, from, to, tz);
          const free = candidates
            .filter((m) => !workDatesOf(current, m.id, ctx.personOf).has(date))
            .sort((x, y) => (load.get(x.id)?.minutes ?? 0) - (load.get(y.id)?.minutes ?? 0));
          let pick: PlannedShift[] | null = null;
          for (const target of shortRules) {
            for (const m of free) {
              const plan = planDay(m, date, current);
              if (!plan.ok) continue;
              const extra = plan.accepted.map((a) => ({ ...a.draft, status: "PENDING" as const }));
              const after = ruleCoverage(target.rule, date, [...current, ...extra].filter((s) => s.role === role), tz);
              if (after.have > target.have || missing(after) < missing(target)) {
                pick = plan.accepted;
                break;
              }
            }
            if (pick) break;
          }
          if (!pick) break;
          for (const p of pick) accepted.push({ ...p, filled: true });
          filled += pick.length;
        }
      }
    }
  }

  accepted.sort((a, b) => a.draft.date.localeCompare(b.draft.date) || a.draft.start_time.localeCompare(b.draft.start_time));
  const final = [...input.existing, ...accepted.map((a) => ({ ...a.draft, status: "PENDING" as const }))];
  return { accepted, skipped, phases, filled, shortages: findShortages(final, dates, roles, staffing, tz) };
}

/** Person-minutes missing to meet a window rule (0 for whole-day rules). */
const missing = (c: RuleCoverage) => c.gaps.reduce((n, g) => n + (g.to - g.from) * (c.need - g.have), 0);

/* -------------------------------------------------------------- copy week */

/**
 * Drafts that repeat the source week on the target week for people still in the planner
 * (declined shifts and removed people left out). Check them with planShifts.
 */
export function copyWeekDrafts(
  shifts: readonly ShiftLike[],
  sourceStart: string,
  targetStart: string,
  roleOf: (staffId: string) => string | undefined,
): { drafts: ShiftDraft[]; leftOut: ShiftLike[] } {
  const drafts: ShiftDraft[] = [];
  const leftOut: ShiftLike[] = [];
  const offset = dayDiff(sourceStart, targetStart);
  for (const s of shifts) {
    const d = dayDiff(sourceStart, s.date);
    if (d < 0 || d > 6 || s.status === "DECLINED") continue;
    const role = roleOf(s.staff_id);
    if (!role) {
      leftOut.push(s);
      continue;
    }
    drafts.push({
      staff_id: s.staff_id,
      date: addDays(s.date, offset),
      start_time: normalizeTime(s.start_time),
      end_time: normalizeTime(s.end_time),
      role,
      ...(s.note ? { note: s.note } : {}),
    });
  }
  drafts.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  return { drafts, leftOut };
}
