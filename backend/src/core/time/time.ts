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
