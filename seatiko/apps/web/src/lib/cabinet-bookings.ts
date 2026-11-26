import type { Order, Reservation, RestaurantReservation } from "@/lib/api";

/**
 * Bookings tab of the owner cabinet: venue-time days, booking states during service,
 * filters, grouping by day and the per-table timeline. Pure functions, no React.
 */

/** Venues of the pilot live in Moldova; the API keeps every booking rule in this zone. */
export const VENUE_TIME_ZONE = "Europe/Chisinau";
/** `visit_duration_min` / `hold_minutes` the API applies when a venue leaves them at 0. */
export const DEFAULT_VISIT_MIN = 90;
export const DEFAULT_HOLD_MIN = 15;

const MINUTE = 60_000;

export type BookingSource = "WEB" | "ANDROID" | "IOS" | "PHONE" | "WALK_IN";

/** One booking as the cabinet shows it: the owner row plus the venue-panel details. */
export type CabinetBooking = {
  id: string;
  venueId: string;
  tableIds: string[];
  tableNumbers: number[];
  guestName: string;
  guestEmail: string;
  guests: number;
  status: string;
  /** Start and end of the visit, epoch ms. */
  start: number;
  end: number;
  durationMin: number;
  /** false when the booking has no own duration and the venue default applies. */
  durationKnown: boolean;
  notes: string;
  source?: BookingSource;
  arrivalConfirmedAt?: number;
  expectedArrival?: number;
  createdAt?: number;
  preorder?: Order;
};

export type VenueBookingRules = { visitMin: number; holdMin: number };

export function venueRules(venue?: { visit_duration_min?: number; hold_minutes?: number } | null): VenueBookingRules {
  const visit = venue?.visit_duration_min ?? 0;
  const hold = venue?.hold_minutes;
  return {
    visitMin: visit > 0 ? visit : DEFAULT_VISIT_MIN,
    holdMin: typeof hold === "number" && hold >= 0 ? hold : DEFAULT_HOLD_MIN,
  };
}

function time(value?: string | null): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

const SOURCES: BookingSource[] = ["WEB", "ANDROID", "IOS", "PHONE", "WALK_IN"];

/**
 * Joins the owner list (guest name and email) with the venue-panel list (duration, notes,
 * tables, source, announced arrival) by booking id. `details` may be null when that request
 * failed: the venue default duration is used then, as the API does for bookings without one.
 */
export function mergeBookings(
  owner: RestaurantReservation[],
  details: Reservation[] | null,
  rules: VenueBookingRules,
): CabinetBooking[] {
  const byId = new Map((details ?? []).map((item) => [item.id, item]));
  const out: CabinetBooking[] = [];
  for (const row of owner) {
    const start = time(row.reserved_for);
    if (start === undefined) continue;
    const extra = byId.get(row.id);
    const ownDuration = extra?.duration_min ?? 0;
    const durationMin = ownDuration > 0 ? ownDuration : rules.visitMin;
    const expectedArrival = time(extra?.expected_arrival);
    // The table stays booked until the announced arrival plus the visit (bookingWindow in the API).
    const from = expectedArrival && expectedArrival > start ? expectedArrival : start;
    const tableNumbers = extra?.table_numbers?.length
      ? extra.table_numbers
      : row.table_number
        ? [row.table_number]
        : [];
    const source = extra?.source && SOURCES.includes(extra.source) ? extra.source : undefined;
    out.push({
      id: row.id,
      venueId: row.venue_id,
      tableIds: extra?.table_ids?.length ? extra.table_ids : [row.table_id],
      tableNumbers,
      guestName: row.guest_name?.trim() ?? "",
      guestEmail: row.guest_email ?? "",
      guests: row.guests,
      status: row.status,
      start,
      end: from + durationMin * MINUTE,
      durationMin,
      durationKnown: ownDuration > 0,
      notes: (extra?.notes ?? "").trim(),
      source,
      arrivalConfirmedAt: time(row.arrival_confirmed_at ?? extra?.arrival_confirmed_at),
      expectedArrival,
      createdAt: time(row.created_at),
      preorder: row.preorder ?? extra?.preorder,
    });
  }
  return out;
}

export const isClosed = (b: { status: string }) => b.status === "CANCELLED" || b.status === "NO_SHOW";
export const isActive = (b: { status: string }) => b.status === "CONFIRMED" || b.status === "CHECKED_IN";

/** Not finished yet: still to come, late within the visit, or at the table now. */
export function isUpcoming(b: CabinetBooking, now: number): boolean {
  return isActive(b) && b.end > now;
}

/** Over: the visit ended, or a cancellation / no-show whose time has come. */
export function isPast(b: CabinetBooking, now: number): boolean {
  return isClosed(b) ? b.start <= now : b.end <= now;
}

/**
 * Bookings still to come for the sidebar badge and the overview, from the owner list alone
 * (no durations there, so the venue default is used).
 */
export function upcomingOwnerBookings<T extends { reserved_for: string; status: string }>(
  rows: T[],
  now: number,
  visitMin = DEFAULT_VISIT_MIN,
): T[] {
  return rows
    .filter((row) => {
      const start = time(row.reserved_for);
      return start !== undefined && isActive(row) && start + visitMin * MINUTE > now;
    })
    .sort((a, b) => Date.parse(a.reserved_for) - Date.parse(b.reserved_for));
}

/* ---------- Booking state during service ---------- */

export type BookingState =
  | "confirmed" // booked, time not come yet
  | "arrival_confirmed" // guest tapped "I'm coming" ahead of time
  | "due" // guest announced a late arrival that is still ahead
  | "late" // time came, guest not here yet, table still held
  | "not_marked" // hold time passed and nobody marked the guest
  | "arrived"
  | "cancelled"
  | "no_show"
  | "unknown";

export type BookingTone = "ok" | "info" | "warn" | "danger" | "muted" | "arrived";

export function bookingState(b: CabinetBooking, now: number, holdMin: number): BookingState {
  if (b.status === "CANCELLED") return "cancelled";
  if (b.status === "NO_SHOW") return "no_show";
  if (b.status === "CHECKED_IN") {
    // The API sets CHECKED_IN both for "I'm coming" (with arrival_confirmed_at) and for a QR
    // check-in at the table (without it, possibly before the booked time).
    if (b.expectedArrival && b.expectedArrival > b.start && b.expectedArrival > now) return "due";
    if (now < b.start && b.arrivalConfirmedAt) return "arrival_confirmed";
    return "arrived";
  }
  if (b.status === "CONFIRMED") {
    if (now < b.start) return "confirmed";
    if (now < b.start + holdMin * MINUTE) return "late";
    return "not_marked";
  }
  return "unknown";
}

export const STATE_TONE: Record<BookingState, BookingTone> = {
  confirmed: "ok",
  arrival_confirmed: "info",
  due: "warn",
  late: "warn",
  not_marked: "muted",
  arrived: "arrived",
  cancelled: "danger",
  no_show: "danger",
  unknown: "muted",
};

/** At the table right now (checked in and the visit is running). */
export function isSeatedNow(b: CabinetBooking, now: number): boolean {
  return now < b.end && bookingState(b, now, 0) === "arrived";
}

/* ---------- Venue-time days ---------- */

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function parts(ms: number, timeZone: string) {
  let format = partFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatters.set(timeZone, format);
  }
  const out: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(ms))) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar day of an instant in the venue zone, "YYYY-MM-DD". */
export function dayKey(ms: number, timeZone = VENUE_TIME_ZONE): string {
  const p = parts(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  const toUtc = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

function zoneOffset(ms: number, timeZone: string): number {
  const p = parts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The instant of venue-local midnight that starts `key` (handles DST like the API). */
export function dayStart(key: string, timeZone = VENUE_TIME_ZONE): number {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}

/** Minutes since venue midnight of `key` (negative before it, above 1440 after it). */
export function minutesIntoDay(ms: number, key: string, timeZone = VENUE_TIME_ZONE): number {
  return Math.round((ms - dayStart(key, timeZone)) / MINUTE);
}

/* ---------- Filters ---------- */

export type BookingPeriod = "today" | "tomorrow" | "day" | "upcoming" | "past" | "all";
export type BookingStatusFilter = "all" | "active" | "CONFIRMED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW";

export type BookingFilters = {
  period: BookingPeriod;
  /** "YYYY-MM-DD" for period "day". */
  day?: string;
  status: BookingStatusFilter;
  /** Table id or "all". */
  table: string;
  query: string;
};

/** Periods that show a single venue day (list by time, or the table timeline). */
export const isDayPeriod = (period: BookingPeriod) => period === "today" || period === "tomorrow" || period === "day";

/** The venue day a day period points at. */
export function periodDay(filters: Pick<BookingFilters, "period" | "day">, now: number, timeZone = VENUE_TIME_ZONE): string | null {
  const today = dayKey(now, timeZone);
  if (filters.period === "today") return today;
  if (filters.period === "tomorrow") return addDays(today, 1);
  if (filters.period === "day") return filters.day ?? today;
  return null;
}

export function inPeriod(
  b: CabinetBooking,
  filters: Pick<BookingFilters, "period" | "day">,
  now: number,
  timeZone = VENUE_TIME_ZONE,
): boolean {
  const day = periodDay(filters, now, timeZone);
  if (day) return dayKey(b.start, timeZone) === day;
  if (filters.period === "upcoming") return isUpcoming(b, now);
  if (filters.period === "past") return isPast(b, now);
  return true;
}

export function matchesStatus(b: CabinetBooking, status: BookingStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "active") return isActive(b);
  return b.status === status;
}

/** Lower case without diacritics, so "placinte" finds "Plăcinte" and "елена" finds "Елена". */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ё/g, "е")
    .toLowerCase()
    .trim();
}

/** Guest name, email, notes or a table number ("5", "№5", "стол 5"). */
export function matchesQuery(b: CabinetBooking, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeSearch(`${b.guestName} ${b.guestEmail} ${b.notes}`);
  const tables = b.tableNumbers.map(String);
  return words.every((word) => {
    const digits = word.replace(/^(?:№|#|nr\.?)/, "");
    if (/^\d+$/.test(digits) && tables.includes(digits)) return true;
    return haystack.includes(word);
  });
}

export function sortBookings(list: CabinetBooking[], order: "asc" | "desc"): CabinetBooking[] {
  const sign = order === "asc" ? 1 : -1;
  return [...list].sort(
    (a, b) => sign * (a.start - b.start) || (a.tableNumbers[0] ?? 0) - (b.tableNumbers[0] ?? 0) || a.id.localeCompare(b.id),
  );
}

/** Newest first for history and "all"; soonest first for everything else. */
export const periodOrder = (period: BookingPeriod): "asc" | "desc" =>
  period === "past" || period === "all" ? "desc" : "asc";

export function filterBookings(
  list: CabinetBooking[],
  filters: BookingFilters,
  now: number,
  timeZone = VENUE_TIME_ZONE,
): CabinetBooking[] {
  const filtered = list.filter(
    (b) =>
      inPeriod(b, filters, now, timeZone) &&
      matchesStatus(b, filters.status) &&
      (filters.table === "all" || b.tableIds.includes(filters.table)) &&
      matchesQuery(b, filters.query),
  );
  return sortBookings(filtered, periodOrder(filters.period));
}

export type PeriodCounts = Record<"today" | "tomorrow" | "upcoming" | "past" | "all", number>;

/** Bookings per quick filter, ignoring search / status / table (the chips show the whole period). */
export function periodCounts(list: CabinetBooking[], now: number, timeZone = VENUE_TIME_ZONE): PeriodCounts {
  const today = dayKey(now, timeZone);
  const tomorrow = addDays(today, 1);
  const counts: PeriodCounts = { today: 0, tomorrow: 0, upcoming: 0, past: 0, all: list.length };
  for (const b of list) {
    const key = dayKey(b.start, timeZone);
    if (key === today) counts.today += 1;
    if (key === tomorrow) counts.tomorrow += 1;
    if (isUpcoming(b, now)) counts.upcoming += 1;
    if (isPast(b, now)) counts.past += 1;
  }
  return counts;
}

/* ---------- Grouping and totals ---------- */

export type DayTotals = { bookings: number; covers: number; cancelled: number };

/** Expected bookings and covers (cancellations and no-shows counted apart). */
export function dayTotals(list: CabinetBooking[]): DayTotals {
  let bookings = 0;
  let covers = 0;
  let cancelled = 0;
  for (const b of list) {
    if (isClosed(b)) {
      cancelled += 1;
    } else {
      bookings += 1;
      covers += b.guests;
    }
  }
  return { bookings, covers, cancelled };
}

export type DayGroup = { day: string; bookings: CabinetBooking[]; totals: DayTotals };

/** Groups by venue day in `order`; inside a day the bookings always read by time. */
export function groupByDay(list: CabinetBooking[], order: "asc" | "desc", timeZone = VENUE_TIME_ZONE): DayGroup[] {
  const groups = new Map<string, CabinetBooking[]>();
  for (const b of list) {
    const key = dayKey(b.start, timeZone);
    const bucket = groups.get(key);
    if (bucket) bucket.push(b);
    else groups.set(key, [b]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (order === "asc" ? a.localeCompare(b) : b.localeCompare(a)))
    .map(([day, bookings]) => {
      const sorted = sortBookings(bookings, "asc");
      return { day, bookings: sorted, totals: dayTotals(sorted) };
    });
}

/** The next guest still expected today (or later), for the "next arrival" tile. */
/** When the guest is expected: the booked time, or the later time they announced. */
export const expectedAt = (b: CabinetBooking) => Math.max(b.start, b.expectedArrival ?? 0);

export function nextArrival(list: CabinetBooking[], now: number): CabinetBooking | undefined {
  const expected: BookingState[] = ["confirmed", "arrival_confirmed", "due"];
  const at = expectedAt;
  return list
    .filter((b) => expected.includes(bookingState(b, now, 0)) && at(b) > now)
    .sort((a, b) => at(a) - at(b) || (a.tableNumbers[0] ?? 0) - (b.tableNumbers[0] ?? 0))[0];
}

/* ---------- Table timeline ---------- */

export type TimelineWindow = { startMin: number; endMin: number };

const DEFAULT_OPEN_MIN = 10 * 60;
const DEFAULT_CLOSE_MIN = 23 * 60;

/**
 * Hours shown on the day timeline: 10:00–23:00, widened to whole hours so every booking of
 * the day fits (a visit past midnight runs to the edge, at most 24:00).
 */
export function timelineWindow(list: CabinetBooking[], day: string, timeZone = VENUE_TIME_ZONE): TimelineWindow {
  let startMin = DEFAULT_OPEN_MIN;
  let endMin = DEFAULT_CLOSE_MIN;
  for (const b of list) {
    const from = minutesIntoDay(b.start, day, timeZone);
    const to = minutesIntoDay(b.end, day, timeZone);
    if (to <= 0 || from >= 24 * 60) continue;
    startMin = Math.min(startMin, Math.floor(Math.max(0, from) / 60) * 60);
    endMin = Math.max(endMin, Math.ceil(Math.min(24 * 60, to) / 60) * 60);
  }
  return { startMin, endMin };
}

export type TimelineBlock = {
  booking: CabinetBooking;
  /** Percent of the window. */
  left: number;
  width: number;
  /** The visit goes on past the right edge (after midnight). */
  clippedEnd: boolean;
};

export type TimelineRow = { tableId: string; number: number; seats?: number; blocks: TimelineBlock[] };

/**
 * One row per table (sorted by number), each with the bookings that hold it during the day.
 * Cancellations and no-shows free the table, so they are left out. Tables that only appear in
 * bookings (removed from the plan since) still get a row.
 */
export function timelineRows(
  list: CabinetBooking[],
  tables: { id: string; number: number; seats?: number }[],
  day: string,
  window: TimelineWindow,
  timeZone = VENUE_TIME_ZONE,
): TimelineRow[] {
  const rows = new Map<string, TimelineRow>();
  for (const table of tables) rows.set(table.id, { tableId: table.id, number: table.number, seats: table.seats, blocks: [] });
  const span = window.endMin - window.startMin;
  for (const b of list) {
    if (isClosed(b)) continue;
    const from = minutesIntoDay(b.start, day, timeZone);
    const to = minutesIntoDay(b.end, day, timeZone);
    if (to <= window.startMin || from >= window.endMin) continue;
    const visibleFrom = Math.max(from, window.startMin);
    const visibleTo = Math.min(to, window.endMin);
    b.tableIds.forEach((tableId, index) => {
      let row = rows.get(tableId);
      if (!row) {
        row = { tableId, number: b.tableNumbers[index] ?? 0, blocks: [] };
        rows.set(tableId, row);
      }
      row.blocks.push({
        booking: b,
        left: ((visibleFrom - window.startMin) / span) * 100,
        width: (Math.max(visibleTo - visibleFrom, 1) / span) * 100,
        clippedEnd: to > window.endMin,
      });
    });
  }
  return [...rows.values()]
    .map((row) => ({ ...row, blocks: row.blocks.sort((a, b) => a.left - b.left) }))
    .sort((a, b) => a.number - b.number || a.tableId.localeCompare(b.tableId));
}

/** Position of "now" on the window in percent, or null when it is outside the day window. */
export function nowMarker(now: number, day: string, window: TimelineWindow, timeZone = VENUE_TIME_ZONE): number | null {
  const minutes = minutesIntoDay(now, day, timeZone);
  if (minutes < window.startMin || minutes > window.endMin) return null;
  return ((minutes - window.startMin) / (window.endMin - window.startMin)) * 100;
}

/* ---------- Formatting ---------- */

const INTL_LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-GB", ro: "ro-RO" };
export const intlLocale = (locale: string) => INTL_LOCALES[locale] ?? "ru-RU";

/** "19:30" in the venue zone (24-hour clock in every language, as on the venue's own schedule). */
export function formatClock(ms: number, timeZone = VENUE_TIME_ZONE): string {
  const p = parts(ms, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "чт, 26 ноября" / "Thu 26 November" / "joi, 26 noiembrie" for a venue day key. */
export function formatDay(key: string, locale: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "UTC",
    weekday: opts.weekday === false ? undefined : "short",
    day: "numeric",
    month: "long",
    year: opts.year ? "numeric" : undefined,
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "26 нояб., 12:08" for an instant, in the venue zone. */
export function formatDateTime(ms: number, locale: string, timeZone = VENUE_TIME_ZONE): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

/** "1 ч 30 мин" from the `{h}` / `{m}` / `{h} {m}` patterns of the copy. */
export function formatDuration(
  minutes: number,
  units: { hours: string; minutes: string; hoursMinutes: string },
): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return units.hoursMinutes.replace("{h}", String(h)).replace("{m}", String(m));
  if (h) return units.hours.replace("{h}", String(h));
  return units.minutes.replace("{m}", String(m));
}
