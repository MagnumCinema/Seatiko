/** Time zone of the venues' opening hours (pilot: Moldova). */
export const VENUE_TIME_ZONE = 'Europe/Chisinau';

/**
 * RFC 3339 in UTC the way Go's encoding/json writes time.Time: fractional seconds
 * without trailing zeros (".5", ".838515"), none when whole. `micros` adds the
 * microseconds Postgres keeps beyond JavaScript's milliseconds.
 */
export function formatTime(date: Date, micros = 0): string {
  const iso = date.toISOString(); // 2026-11-25T08:28:42.838Z
  const base = iso.slice(0, 19);
  const fraction = (iso.slice(20, 23) + String(micros).padStart(3, '0')).replace(/0+$/, '');
  return fraction ? `${base}.${fraction}Z` : `${base}Z`;
}

/** Wall clock, injectable so tests control "now". */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/**
 * A timestamptz string as node-postgres returns it ("2026-11-25 08:28:42.838515+00")
 * to Go-style RFC 3339 UTC, keeping the microseconds.
 */
export function formatDbTime(value: string): string {
  const m = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d(?::?\d\d)?)?$/.exec(value);
  if (!m) return formatTime(new Date(value));
  const digits = (m[3] ?? '').padEnd(6, '0');
  let offset = m[4] ?? 'Z';
  if (offset !== 'Z' && offset.length === 3) offset += ':00';
  else if (offset !== 'Z' && !offset.includes(':')) offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const date = new Date(`${m[1]}T${m[2]}.${digits.slice(0, 3)}${offset}`);
  return formatTime(date, Number(digits.slice(3)));
}

/** Date of a timestamptz string from the database. */
export const dbDate = (value: string): Date => new Date(formatDbTime(value));

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VENUE_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Wall-clock date and time of an instant in the venue time zone. */
export function venueLocalParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** Offset of the venue time zone from UTC at an instant, in ms. */
function venueOffsetMs(date: Date): number {
  const p = venueLocalParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant of a venue wall-clock time: local midnight of year-month-day plus
 * `minutes` (may pass midnight), as time.Date(..., VenueLocation) in Go.
 */
export function venueLocalTime(year: number, month: number, day: number, minutes: number): Date {
  const guess = Date.UTC(year, month - 1, day, 0, minutes);
  const first = guess - venueOffsetMs(new Date(guess));
  return new Date(guess - venueOffsetMs(new Date(first)));
}
