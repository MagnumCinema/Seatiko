import type { Venue } from "@/lib/api";

/** Per-venue booking rules, configured by the owner (APP_LOGIC §5.3). All values in minutes. */
export type BookingRules = {
  /** Step between bookable start times. */
  booking_interval_min: number;
  /** Booking length preselected for guests (they can change it). */
  visit_duration_min: number;
  /** Longest booking a guest may choose. */
  max_visit_duration_min: number;
  /** Lateness tolerated without warning; the table is held this long after the booking time. */
  hold_minutes: number;
  /** Lateness a guest may announce via "I'm coming"; the table then waits until that time. */
  max_late_arrival_min: number;
  /** How early the booked guest may be seated before the booking time. */
  session_start_before_min: number;
  /** How early walk-in guests must free the table before the booking time. */
  release_before_min: number;
};

export type BookingRuleKey = keyof BookingRules;

/** Must match the API defaults (services/api/internal/store/booking_rules.go). */
export const DEFAULT_BOOKING_RULES: BookingRules = {
  booking_interval_min: 30,
  visit_duration_min: 90,
  max_visit_duration_min: 180,
  hold_minutes: 15,
  max_late_arrival_min: 30,
  session_start_before_min: 60,
  release_before_min: 15,
};

/** Must match the API validation. */
export const BOOKING_RULE_LIMITS: Record<BookingRuleKey, { min: number; max: number }> = {
  booking_interval_min: { min: 15, max: 120 },
  visit_duration_min: { min: 30, max: 360 },
  max_visit_duration_min: { min: 60, max: 480 },
  hold_minutes: { min: 0, max: 60 },
  max_late_arrival_min: { min: 0, max: 120 },
  session_start_before_min: { min: 0, max: 180 },
  release_before_min: { min: 0, max: 60 },
};

export const BOOKING_RULE_KEYS = Object.keys(DEFAULT_BOOKING_RULES) as BookingRuleKey[];

/** Venue rules with defaults for anything the owner has not set (0 / missing). */
export function resolveBookingRules(venue: Partial<Venue> | null | undefined): BookingRules {
  const out = { ...DEFAULT_BOOKING_RULES };
  if (!venue) return out;
  for (const key of BOOKING_RULE_KEYS) {
    const value = venue[key];
    if (typeof value === "number" && Number.isFinite(value) && (value > 0 || key === "hold_minutes")) {
      out[key] = value;
    }
  }
  if (venue.hold_minutes === undefined || venue.hold_minutes === null) {
    out.hold_minutes = DEFAULT_BOOKING_RULES.hold_minutes;
  }
  if (out.max_late_arrival_min < out.hold_minutes) out.max_late_arrival_min = out.hold_minutes;
  if (out.visit_duration_min > out.max_visit_duration_min) {
    out.visit_duration_min = out.max_visit_duration_min;
  }
  return out;
}

/** Shortest booking a guest can choose; matches the API. */
export const MIN_VISIT_DURATION_MIN = 30;

/** Booking lengths offered to the guest: half-hour steps from 1 h up to the venue max, plus the default. */
export function durationOptions(rules: BookingRules): number[] {
  const options = new Set<number>([rules.visit_duration_min]);
  for (let min = 60; min <= rules.max_visit_duration_min; min += 30) options.add(min);
  return [...options]
    .filter((min) => min >= MIN_VISIT_DURATION_MIN && min <= rules.max_visit_duration_min)
    .sort((a, b) => a - b);
}

export type BookingRuleError = { key: BookingRuleKey; reason: "range" | "below_hold" | "above_max" };

/** Field-level validation mirroring the API. */
export function validateBookingRules(rules: BookingRules): BookingRuleError[] {
  const errors: BookingRuleError[] = [];
  for (const key of BOOKING_RULE_KEYS) {
    const { min, max } = BOOKING_RULE_LIMITS[key];
    const value = rules[key];
    if (!Number.isInteger(value) || value < min || value > max) errors.push({ key, reason: "range" });
  }
  if (
    rules.max_late_arrival_min < rules.hold_minutes &&
    !errors.some((e) => e.key === "max_late_arrival_min")
  ) {
    errors.push({ key: "max_late_arrival_min", reason: "below_hold" });
  }
  if (
    rules.visit_duration_min > rules.max_visit_duration_min &&
    !errors.some((e) => e.key === "visit_duration_min")
  ) {
    errors.push({ key: "visit_duration_min", reason: "above_max" });
  }
  return errors;
}
