import type { Reservation, StaffMember, WorkShift } from "@/lib/api";
import {
  addDays,
  DEFAULT_HOLD_MIN,
  dayKey,
  daysBetween,
  minutesIntoDay,
  VENUE_TIME_ZONE,
  type BookingSource,
} from "@/lib/cabinet-bookings";

/**
 * Reports of the owner cabinet («Отчёты»): bookings and guests over a period in venue days,
 * compared with the period before, plus the team's scheduled hours. Pure functions, no React.
 *
 * Definitions (shown to the owner next to each number):
 * - a booking belongs to the venue day of its visit (`reserved_for` in the venue zone);
 * - "bookings" counts every booking of the period, cancelled ones included;
 * - "guests" (covers) adds up party sizes without cancellations and no-shows;
 * - the no-show rate is measured over visits whose time has passed.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type ReportBooking = {
  id: string;
  start: number;
  status: string;
  guests: number;
  source?: BookingSource;
  createdAt?: number;
  userId?: string;
  tables: number[];
};

function time(value?: string | null): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Venue bookings (`GET /staff/reservations?venue_id=`) as the reports read them. */
export function toReportBookings(rows: Reservation[]): ReportBooking[] {
  const out: ReportBooking[] = [];
  for (const row of rows) {
    const start = time(row.reserved_for);
    if (start === undefined) continue;
    out.push({
      id: row.id,
      start,
      status: row.status,
      guests: Math.max(0, row.guests || 0),
      source: row.source,
      createdAt: time(row.created_at),
      userId: row.user_id || undefined,
      tables: row.table_numbers?.length ? row.table_numbers : row.table_number ? [row.table_number] : [],
    });
  }
  return out;
}

/* ---------- Periods ---------- */

export type DayRange = { from: string; to: string };
export type PeriodRange = { days: number; thisPeriod: DayRange; lastPeriod: DayRange };

/** The last `days` venue days up to today, and as many days right before them. */
export function periodRange(days: number, now: number, timeZone = VENUE_TIME_ZONE): PeriodRange {
  const today = dayKey(now, timeZone);
  return {
    days,
    thisPeriod: { from: addDays(today, -(days - 1)), to: today },
    lastPeriod: { from: addDays(today, -(2 * days - 1)), to: addDays(today, -days) },
  };
}

const inRange = (day: string, range: DayRange) => day >= range.from && day <= range.to;

/** Every venue day of a range, oldest first. */
export function rangeDays(range: DayRange): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ---------- Outcomes ---------- */

export type Outcome = "arrived" | "not_marked" | "upcoming" | "no_show" | "cancelled";

/**
 * What became of a booking. CHECKED_IN before the visit is the guest's "I'm coming", so it
 * is still ahead; a CONFIRMED booking past the hold time was never marked in the hall.
 */
export function outcomeOf(b: Pick<ReportBooking, "start" | "status">, now: number, holdMin = DEFAULT_HOLD_MIN): Outcome {
  if (b.status === "CANCELLED") return "cancelled";
  if (b.status === "NO_SHOW") return "no_show";
  if (b.status === "CHECKED_IN") return b.start > now ? "upcoming" : "arrived";
  return b.start + holdMin * MINUTE > now ? "upcoming" : "not_marked";
}

/** Guests of this outcome sit at a table (or are expected to). */
const seats = (o: Outcome) => o === "arrived" || o === "not_marked" || o === "upcoming";

type Tally = {
  bookings: number;
  covers: number;
  parties: number;
  arrived: number;
  notMarked: number;
  upcoming: number;
  noShow: number;
  cancelled: number;
};

const emptyTally = (): Tally => ({
  bookings: 0,
  covers: 0,
  parties: 0,
  arrived: 0,
  notMarked: 0,
  upcoming: 0,
  noShow: 0,
  cancelled: 0,
});

function add(t: Tally, b: ReportBooking, now: number) {
  const o = outcomeOf(b, now);
  t.bookings++;
  if (seats(o)) {
    t.covers += b.guests;
    t.parties++;
  }
  if (o === "arrived") t.arrived++;
  else if (o === "not_marked") t.notMarked++;
  else if (o === "upcoming") t.upcoming++;
  else if (o === "no_show") t.noShow++;
  else t.cancelled++;
}

export type Summary = Tally & {
  /** Guests per booking that came or is expected. */
  avgParty: number | null;
  cancelRate: number | null;
  /** No-shows among visits whose time has passed (arrived, not marked, no-show). */
  noShowRate: number | null;
};

export function summarize(list: ReportBooking[], range: DayRange, now: number, timeZone = VENUE_TIME_ZONE): Summary {
  const t = emptyTally();
  for (const b of list) if (inRange(dayKey(b.start, timeZone), range)) add(t, b, now);
  const due = t.arrived + t.notMarked + t.noShow;
  return {
    ...t,
    avgParty: t.parties ? t.covers / t.parties : null,
    cancelRate: t.bookings ? t.cancelled / t.bookings : null,
    noShowRate: due ? t.noShow / due : null,
  };
}

/* ---------- Comparison ---------- */

export type Delta = { kind: "pct"; value: number } | { kind: "pp"; value: number } | { kind: "new" };

/** Relative change of a count; "new" when the period before had none. */
export function countDelta(current: number, previous: number): Delta | null {
  if (!previous) return current ? { kind: "new" } : null;
  return { kind: "pct", value: (current - previous) / previous };
}

/** Change of a share in percentage points. */
export function rateDelta(current: number | null, previous: number | null): Delta | null {
  if (current === null || previous === null) return null;
  return { kind: "pp", value: Math.round((current - previous) * 1000) / 10 };
}

/* ---------- Series ---------- */

export type SeriesPoint = Tally & { key: string; from: string; to: string };

/** One point per day up to a month; longer periods go by weeks that end today (the oldest may be shorter). */
export function series(list: ReportBooking[], range: DayRange, now: number, timeZone = VENUE_TIME_ZONE): SeriesPoint[] {
  const total = daysBetween(range.from, range.to) + 1;
  const step = total > 31 ? 7 : 1;
  const points: SeriesPoint[] = [];
  for (let to = range.to; to >= range.from; to = addDays(to, -step)) {
    const from = step === 1 ? to : addDays(to, -(step - 1)) < range.from ? range.from : addDays(to, -(step - 1));
    points.unshift({ key: from, from, to, ...emptyTally() });
  }
  for (const b of list) {
    const day = dayKey(b.start, timeZone);
    if (!inRange(day, range)) continue;
    const point = points.find((p) => day >= p.from && day <= p.to);
    if (point) add(point, b, now);
  }
  return points;
}

/** ISO weekday of a venue day: 1 = Monday … 7 = Sunday. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

export type WeekdayAverage = { weekday: number; days: number; covers: number; average: number };

/** Guests per weekday, averaged over how many such days the period has. Monday first. */
export function weekdayAverages(list: ReportBooking[], range: DayRange, now: number, timeZone = VENUE_TIME_ZONE): WeekdayAverage[] {
  const out: WeekdayAverage[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, days: 0, covers: 0, average: 0 }));
  for (const day of rangeDays(range)) out[weekdayOf(day) - 1].days++;
  for (const b of list) {
    const day = dayKey(b.start, timeZone);
    if (!inRange(day, range) || !seats(outcomeOf(b, now))) continue;
    out[weekdayOf(day) - 1].covers += b.guests;
  }
  for (const d of out) d.average = d.days ? d.covers / d.days : 0;
  return out;
}

export type HourCount = { hour: number; covers: number; bookings: number };

/** Guests by the hour they are booked for (venue time), from the first to the last busy hour. */
export function hourly(list: ReportBooking[], range: DayRange, now: number, timeZone = VENUE_TIME_ZONE): HourCount[] {
  const byHour = new Map<number, HourCount>();
  for (const b of list) {
    const day = dayKey(b.start, timeZone);
    if (!inRange(day, range) || !seats(outcomeOf(b, now))) continue;
    const hour = Math.min(23, Math.max(0, Math.floor(minutesIntoDay(b.start, day, timeZone) / 60)));
    const entry = byHour.get(hour) ?? { hour, covers: 0, bookings: 0 };
    entry.covers += b.guests;
    entry.bookings++;
    byHour.set(hour, entry);
  }
  if (!byHour.size) return [];
  const hours = [...byHour.keys()];
  const out: HourCount[] = [];
  for (let h = Math.min(...hours); h <= Math.max(...hours); h++) out.push(byHour.get(h) ?? { hour: h, covers: 0, bookings: 0 });
  return out;
}

export function peakHour(hours: HourCount[]): HourCount | null {
  let best: HourCount | null = null;
  for (const h of hours) if (h.covers > 0 && (!best || h.covers > best.covers)) best = h;
  return best;
}

/* ---------- Sources, guests, lead time ---------- */

export type SourceKey = "WEB" | "APP" | "PHONE" | "WALK_IN" | "OTHER";
const SOURCE_ORDER: SourceKey[] = ["WEB", "APP", "PHONE", "WALK_IN", "OTHER"];

function sourceKey(source?: BookingSource): SourceKey {
  if (source === "ANDROID" || source === "IOS") return "APP";
  if (source === "WEB" || source === "PHONE" || source === "WALK_IN") return source;
  return "OTHER";
}

/** Where the period's bookings came from, largest first (cancelled ones included). */
export function sourceShares(list: ReportBooking[], range: DayRange, timeZone = VENUE_TIME_ZONE) {
  const counts = new Map<SourceKey, number>();
  let total = 0;
  for (const b of list) {
    if (!inRange(dayKey(b.start, timeZone), range)) continue;
    const key = sourceKey(b.source);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }
  return SOURCE_ORDER.filter((key) => counts.has(key))
    .map((source) => ({ source, count: counts.get(source)!, share: counts.get(source)! / total }))
    .sort((a, b) => b.count - a.count);
}

const isVisit = (b: ReportBooking) => b.status !== "CANCELLED" && b.status !== "NO_SHOW";
const knownGuest = (b: ReportBooking) => Boolean(b.userId) && b.source !== "WALK_IN";

/** Guests with a visit in the period, and how many of them had been here before. */
export function returningGuests(list: ReportBooking[], range: DayRange, timeZone = VENUE_TIME_ZONE) {
  const visits = list.filter((b) => isVisit(b) && knownGuest(b));
  const lastInRange = new Map<string, number>();
  for (const b of visits) {
    if (!inRange(dayKey(b.start, timeZone), range)) continue;
    lastInRange.set(b.userId!, Math.max(lastInRange.get(b.userId!) ?? 0, b.start));
  }
  let returning = 0;
  for (const [user, last] of lastInRange) {
    if (visits.some((b) => b.userId === user && b.start < last)) returning++;
  }
  return { guests: lastInRange.size, returning };
}

/** How far ahead guests book (median hours) and the share booked on the day of the visit. */
export function leadTime(list: ReportBooking[], range: DayRange, timeZone = VENUE_TIME_ZONE) {
  const leads: number[] = [];
  let sameDay = 0;
  for (const b of list) {
    if (b.source === "WALK_IN" || b.createdAt === undefined || !inRange(dayKey(b.start, timeZone), range)) continue;
    leads.push(Math.max(0, (b.start - b.createdAt) / HOUR));
    if (dayKey(b.createdAt, timeZone) === dayKey(b.start, timeZone)) sameDay++;
  }
  if (!leads.length) return null;
  leads.sort((a, b) => a - b);
  const mid = Math.floor(leads.length / 2);
  const medianHours = leads.length % 2 ? leads[mid] : (leads[mid - 1] + leads[mid]) / 2;
  return { medianHours, sameDayShare: sameDay / leads.length };
}

/* ---------- Team ---------- */

const clockMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Minutes of a shift; an end at or before the start means the shift runs past midnight. */
export function shiftLength(start: string, end: string): number {
  const from = clockMinutes(start);
  const to = clockMinutes(end);
  if (to === from) return 0;
  return to > from ? to - from : to + 24 * 60 - from;
}

export type RoleHours = { role: string; hours: number; shifts: number; people: number };
export type PersonHours = { staffId: string; name: string; role: string; hours: number; shifts: number; declined: number; swaps: number };

/** Scheduled hours of the period by role and by person (declined shifts are not worked). */
export function teamHours(shifts: WorkShift[], staff: StaffMember[], range: DayRange) {
  const members = new Map(staff.map((m) => [m.id, m]));
  const roles = new Map<string, { minutes: number; shifts: number; people: Set<string> }>();
  const people = new Map<string, PersonHours & { minutes: number }>();
  let minutes = 0;
  let count = 0;
  for (const s of shifts) {
    if (!inRange(s.date, range)) continue;
    const m = members.get(s.staff_id);
    const person =
      people.get(s.staff_id) ??
      { staffId: s.staff_id, name: m?.name?.trim() || s.staff_name || m?.email || "", role: m?.role ?? s.role, hours: 0, shifts: 0, declined: 0, swaps: 0, minutes: 0 };
    people.set(s.staff_id, person);
    if (s.status === "DECLINED") {
      person.declined++;
      continue;
    }
    if (s.status === "SWAP_REQUESTED") person.swaps++;
    const length = shiftLength(s.start_time, s.end_time);
    person.minutes += length;
    person.shifts++;
    const role = roles.get(s.role) ?? { minutes: 0, shifts: 0, people: new Set<string>() };
    role.minutes += length;
    role.shifts++;
    role.people.add(s.staff_id);
    roles.set(s.role, role);
    minutes += length;
    count++;
  }
  const hours = (min: number) => Math.round((min / 60) * 10) / 10;
  return {
    totalHours: hours(minutes),
    shifts: count,
    byRole: [...roles]
      .map(([role, r]) => ({ role, hours: hours(r.minutes), shifts: r.shifts, people: r.people.size }))
      .sort((a, b) => b.hours - a.hours),
    byPerson: [...people.values()]
      .map(({ minutes: min, ...p }) => ({ ...p, hours: hours(min) }))
      .sort((a, b) => b.hours - a.hours || b.shifts - a.shifts),
  };
}

/* ---------- Chart scales ---------- */

/** Top of a value axis: the next clean number (1, 2, 4, 5, 10 × 10ⁿ) at or above the maximum. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 4, 5, 10]) if (step * magnitude >= max) return step * magnitude;
  return 10 * magnitude;
}

/** Axis ticks: zero, the middle when it is a whole number, and the top. */
export function axisTicks(top: number): number[] {
  return Number.isInteger(top / 2) && top > 1 ? [0, top / 2, top] : [0, top];
}

/** Columns that get an axis label: all when they fit, else every n-th counted back from the last. */
export function labelEvery(count: number, maxLabels: number): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil(count / maxLabels);
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

/* ---------- Formatting ---------- */

/** Part of a whole (legend, sources): whole percent; a sliver shows as "<1 %". */
export function formatShare(value: number, intlLocale: string): string {
  const format = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 0 });
  return value > 0 && value < 0.01 ? `<${format.format(0.01)}` : format.format(value);
}

/** A rate the owner watches (cancellations, no-shows): up to one decimal, like its change in points. */
export function formatRate(value: number, intlLocale: string): string {
  return new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 1 }).format(value);
}

/* ---------- Export ---------- */

/** Semicolon-separated table (what Excel opens directly in RU / RO locales). */
export function reportCsv(header: string[], rows: (string | number)[][]): string {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
