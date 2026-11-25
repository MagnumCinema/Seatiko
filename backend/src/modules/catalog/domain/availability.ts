// Free booking starts per venue, ported from store/availability.go. Pure functions:
// the service loads venues, tables and active bookings, this decides.
import { formatTime, venueLocalParts, venueLocalTime } from '../../../core/time/time.js';
import { type BookingRules, DEFAULT_BOOKING_INTERVAL_MIN, venueBookingDuration, visitMinutes } from './booking-rules.js';

/** A guest cannot book a start sooner than this from now (MIN_LEAD_MIN on the web). */
export const MIN_BOOKING_LEAD_MIN = 15;
export const DEFAULT_AVAILABILITY_WINDOW_MIN = 90;
const MIN = 60_000;

export type OpeningHours = { openMin: number; closeMin: number };
export const DEFAULT_OPENING_HOURS: OpeningHours = { openMin: 10 * 60, closeMin: 23 * 60 };

/** "Пн–Вс 10:00–22:00" / "Mon–Sun 12:00–01:00" → minutes from local midnight (close may pass 24h). */
export function parseOpeningHours(text: string): OpeningHours {
  const m = /(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return DEFAULT_OPENING_HOURS;
  const open = Number(m[1]) * 60 + Number(m[2]);
  let close = Number(m[3]) * 60 + Number(m[4]);
  if (open >= 24 * 60 || close > 24 * 60) return DEFAULT_OPENING_HOURS;
  if (close <= open) close += 24 * 60;
  return { openMin: open, closeMin: close };
}

export type AvailabilityVenue = BookingRules & { id: string; rating: number; hoursText: string };
export type AvailabilityTable = {
  id: string;
  venueId: string;
  number: number;
  seats: number;
  status: string;
  occupiedSince: Date | null;
  reservedFor: Date | null;
};
/** Window an active booking blocks a table. */
export type Block = { tableId: string; from: Date; until: Date };

export type AvailabilityQuery = {
  /** Any instant inside the wanted local day. */
  day: Date;
  /** Wanted start; undefined = as soon as possible that day. */
  target?: Date;
  guests: number;
  durationMin: number;
  windowMin: number;
  limit: number;
  now: Date;
};

export type Slot = { starts_at: string; table_id: string; table_number: number };
export type VenueAvailability = {
  venue_id: string;
  duration_min: number;
  fits: boolean;
  exact: boolean;
  slots: Slot[];
  later_today?: Slot[];
};

/** When a seated or cleaning table should be free again. */
export function occupiedUntil(t: Pick<AvailabilityTable, 'occupiedSince'>, now: Date, visitMs: number): Date {
  let until = now.getTime() + 15 * MIN;
  if (t.occupiedSince) until = Math.max(until, t.occupiedSince.getTime() + visitMs);
  return new Date(until);
}

/** Would a booking [start, start+span) overlap the table's bookings or its live state? */
export function tableBusyAt(t: AvailabilityTable, blocks: Block[], start: Date, spanMs: number, now: Date, visitMs: number): boolean {
  const s = start.getTime();
  const e = s + spanMs;
  for (const b of blocks) if (b.tableId === t.id && s < b.until.getTime() && e > b.from.getTime()) return true;
  switch (t.status) {
    case 'OCCUPIED':
    case 'CLEANING':
      return s < occupiedUntil(t, now, visitMs).getTime();
    case 'RESERVED':
      return t.reservedFor !== null && s < t.reservedFor.getTime() + visitMs && e > t.reservedFor.getTime();
  }
  return false;
}

type FreeStart = { at: Date; slot: Slot };

function freeStarts(v: AvailabilityVenue, candidates: AvailabilityTable[], blocks: Block[], q: AvailabilityQuery, durationMin: number): FreeStart[] {
  const hours = parseOpeningHours(v.hoursText);
  const step = v.bookingIntervalMin > 0 ? v.bookingIntervalMin : DEFAULT_BOOKING_INTERVAL_MIN;
  const local = venueLocalParts(q.day);
  const earliest = q.now.getTime() + MIN_BOOKING_LEAD_MIN * MIN;
  const visitMs = visitMinutes(v) * MIN;
  const out: FreeStart[] = [];
  for (let m = hours.openMin; m + durationMin <= hours.closeMin; m += step) {
    const start = venueLocalTime(local.year, local.month, local.day, m);
    if (start.getTime() < earliest) continue;
    const table = candidates.find((t) => !tableBusyAt(t, blocks, start, durationMin * MIN, q.now, visitMs));
    if (table) out.push({ at: start, slot: { starts_at: formatTime(start), table_id: table.id, table_number: table.number } });
  }
  return out;
}

/** One venue's free starts around the wanted time and the smallest fitting table for each. */
export function venueAvailability(v: AvailabilityVenue, tables: AvailabilityTable[], blocks: Block[], q: AvailabilityQuery): { result: VenueAvailability; starts: Date[] } {
  const durationMin = venueBookingDuration(v, q.durationMin);
  const result: VenueAvailability = { venue_id: v.id, duration_min: durationMin, fits: false, exact: false, slots: [] };
  const candidates = tables
    .filter((t) => t.seats >= q.guests)
    .sort((a, b) => a.seats - b.seats || a.number - b.number);
  if (!candidates.length) return { result, starts: [] };
  result.fits = true;

  const free = freeStarts(v, candidates, blocks, q, durationMin);
  if (!q.target) {
    const first = free.slice(0, q.limit);
    result.slots = first.map((f) => f.slot);
    return { result, starts: first.map((f) => f.at) };
  }
  const target = q.target.getTime();
  const gap = (f: FreeStart) => Math.abs(f.at.getTime() - target);
  const near = free
    .filter((f) => gap(f) <= q.windowMin * MIN)
    .sort((a, b) => gap(a) - gap(b) || a.at.getTime() - b.at.getTime())
    .slice(0, q.limit)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  result.slots = near.map((f) => f.slot);
  result.exact = near.some((f) => f.at.getTime() === target);
  if (!near.length) result.later_today = free.slice(0, q.limit).map((f) => f.slot);
  return { result, starts: near.map((f) => f.at) };
}

/** Exact time first, then the closest free start (seconds); venues with nothing last. */
export function availabilityRank(r: VenueAvailability, starts: Date[], target?: Date): number {
  if (!r.slots.length) return Infinity;
  if (r.exact) return 0;
  if (!target) return starts[0].getTime() / 1000;
  return Math.min(...starts.map((s) => Math.abs(s.getTime() - target.getTime()) / 1000));
}

/** Every venue's answer, sorted: rank, then rating, then id. */
export function searchAvailability(
  venues: AvailabilityVenue[],
  tables: AvailabilityTable[],
  blocks: Block[],
  q: AvailabilityQuery,
): VenueAvailability[] {
  const query = { ...q, limit: q.limit > 0 ? q.limit : 4, windowMin: q.windowMin > 0 ? q.windowMin : DEFAULT_AVAILABILITY_WINDOW_MIN };
  return venues
    .map((v) => {
      const { result, starts } = venueAvailability(v, tables.filter((t) => t.venueId === v.id), blocks, query);
      return { result, rank: availabilityRank(result, starts, query.target), rating: v.rating };
    })
    .sort((a, b) => (a.rank === b.rank ? 0 : a.rank < b.rank ? -1 : 1) || b.rating - a.rating || (a.result.venue_id < b.result.venue_id ? -1 : 1))
    .map((r) => r.result);
}
