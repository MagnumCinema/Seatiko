// Per-venue booking rule defaults (minutes), as store/booking_rules.go; the web
// client mirrors them in src/lib/venue-rules.ts.

export const DEFAULT_BOOKING_INTERVAL_MIN = 30;
export const DEFAULT_VISIT_DURATION_MIN = 90;
export const DEFAULT_MAX_VISIT_DURATION_MIN = 180;
export const MIN_VISIT_DURATION_MIN = 30;
export const DEFAULT_HOLD_MINUTES = 15;
/** Fallback table turn time used to quote waitlist waits. */
export const DEFAULT_TURN_MINUTES = 20;

export type BookingRules = {
  visitDurationMin: number;
  maxVisitDurationMin: number;
  bookingIntervalMin: number;
  holdMinutes: number;
};

/** Longest booking a guest may choose at this venue. */
export function maxVisitMinutes(v: BookingRules): number {
  return v.maxVisitDurationMin > 0 ? v.maxVisitDurationMin : DEFAULT_MAX_VISIT_DURATION_MIN;
}

/** Default booking length preselected for guests at this venue. */
export function visitMinutes(v: BookingRules): number {
  const d = v.visitDurationMin > 0 ? v.visitDurationMin : DEFAULT_VISIT_DURATION_MIN;
  return Math.min(d, maxVisitMinutes(v));
}

/** Booking lengths offered: the venue default plus half-hour steps from 1 h to the max. */
export function bookingDurationOptions(v: BookingRules): number[] {
  const max = maxVisitMinutes(v);
  const set = new Set([visitMinutes(v)]);
  for (let m = 60; m <= max; m += 30) set.add(m);
  return [...set].filter((m) => m >= MIN_VISIT_DURATION_MIN && m <= max).sort((a, b) => a - b);
}

/** Longest offered length not above the requested one (0 = venue default). */
export function venueBookingDuration(v: BookingRules, requested: number): number {
  if (requested <= 0) return visitMinutes(v);
  const options = bookingDurationOptions(v);
  let best = 0;
  for (const m of options) if (m <= requested) best = m;
  return best || options[0] || visitMinutes(v);
}

/** Waitlist turn time: the venue hold, else 20 minutes. */
export function turnMinutes(v: BookingRules): number {
  return v.holdMinutes > 0 ? v.holdMinutes : DEFAULT_TURN_MINUTES;
}
