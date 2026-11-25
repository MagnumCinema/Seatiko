// Owner settings of a venue, ported from store/booking_rules.go and ops.go.
import { DEFAULT_MAX_VISIT_DURATION_MIN } from '../../catalog/domain/booking-rules.js';

export type RuleValues = {
  bookingIntervalMin: number;
  holdMinutes: number;
  preorderLeadMin: number;
  sessionStartBeforeMin: number;
  releaseBeforeMin: number;
  maxLateArrivalMin: number;
  visitDurationMin: number;
  maxVisitDurationMin: number;
};

const within = (v: number, min: number, max: number) => v >= min && v <= max;

/** Zero means "the default" for everything except hold_minutes (0 = no grace period). */
export function validBookingRules(v: RuleValues): boolean {
  const optional: Array<[number, number, number]> = [
    [v.bookingIntervalMin, 15, 120],
    [v.visitDurationMin, 30, 360],
    [v.maxVisitDurationMin, 60, 480],
    [v.maxLateArrivalMin, 0, 120],
    [v.sessionStartBeforeMin, 0, 180],
    [v.releaseBeforeMin, 0, 60],
  ];
  if (optional.some(([value, min, max]) => value !== 0 && !within(value, min, max))) return false;
  if (!within(v.holdMinutes, 0, 60) || !within(v.preorderLeadMin, 0, 180)) return false;
  if (v.maxLateArrivalMin !== 0 && v.maxLateArrivalMin < v.holdMinutes) return false;
  const maxVisit = v.maxVisitDurationMin > 0 ? v.maxVisitDurationMin : DEFAULT_MAX_VISIT_DURATION_MIN;
  return v.visitDurationMin === 0 || v.visitDurationMin <= maxVisit;
}

/** Table position on the floor plan, kept off the edges. */
export const clampX = (x: number) => Math.min(0.92, Math.max(0.08, x));
export const clampY = (y: number) => Math.min(0.88, Math.max(0.12, y));

/** Alcohol is always 18+ (normalizeAgeRestriction). */
export const ageRestricted = (item: { containsAlcohol: boolean; requiresAge18: boolean }) => item.containsAlcohol || item.requiresAge18;
