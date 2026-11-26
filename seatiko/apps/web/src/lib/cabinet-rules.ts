/**
 * Owner cabinet → «Правила бронирования»: stepping and checking the rule fields and
 * the "what the guest sees" preview. Pure functions, no React.
 */
import type { OpeningHours } from "@/lib/booking-slots";
import {
  BOOKING_RULE_KEYS,
  BOOKING_RULE_LIMITS,
  type BookingRuleKey,
  type BookingRules,
} from "@/lib/venue-rules";

/** − / + step of each field; typed values off the grid are allowed and snap on the next step. */
export const RULE_STEPS: Record<BookingRuleKey, number> = {
  booking_interval_min: 5,
  visit_duration_min: 15,
  max_visit_duration_min: 30,
  hold_minutes: 5,
  max_late_arrival_min: 5,
  session_start_before_min: 5,
  release_before_min: 5,
  preorder_lead_min: 5,
};

/** Time steps offered as chips; any other value the venue already has is kept as an extra chip. */
export const BOOKING_INTERVAL_PRESETS = [15, 20, 30, 45, 60, 90, 120];

/** The example booking in the preview starts at this time when the venue takes bookings then. */
const EXAMPLE_BOOKING_MIN = 19 * 60;

/** Whole minutes typed by the owner; empty or anything else is NaN (shown as an error). */
export function parseRuleInput(raw: string): number {
  const text = raw.trim();
  return /^\d{1,4}$/.test(text) ? Number(text) : Number.NaN;
}

/** Next value on the field's step grid in `direction`, kept inside the allowed range. */
export function stepRuleValue(key: BookingRuleKey, value: number, direction: 1 | -1): number {
  const { min, max } = BOOKING_RULE_LIMITS[key];
  if (!Number.isFinite(value)) return min;
  const step = RULE_STEPS[key];
  const next = direction > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;
  return Math.min(max, Math.max(min, next));
}

export function intervalChoices(current: number): number[] {
  const choices = new Set(BOOKING_INTERVAL_PRESETS);
  const { min, max } = BOOKING_RULE_LIMITS.booking_interval_min;
  if (Number.isInteger(current) && current >= min && current <= max) choices.add(current);
  return [...choices].sort((a, b) => a - b);
}

export function changedRuleKeys(saved: BookingRules, draft: BookingRules): BookingRuleKey[] {
  return BOOKING_RULE_KEYS.filter((key) => saved[key] !== draft[key]);
}

/**
 * Rules for the live preview while the owner types: a field that is empty or out of range
 * keeps its saved value, and a half-edited pair is evened out like resolveBookingRules does.
 */
export function previewRules(draft: BookingRules, saved: BookingRules): BookingRules {
  const out = { ...saved };
  for (const key of BOOKING_RULE_KEYS) {
    const { min, max } = BOOKING_RULE_LIMITS[key];
    const value = draft[key];
    if (Number.isInteger(value) && value >= min && value <= max) out[key] = value;
  }
  if (out.max_late_arrival_min < out.hold_minutes) out.max_late_arrival_min = out.hold_minutes;
  if (out.visit_duration_min > out.max_visit_duration_min) out.visit_duration_min = out.max_visit_duration_min;
  return out;
}

/** Start times (minutes from local midnight) a guest is offered on an empty day for the default length. */
export function dailyStartTimes(rules: BookingRules, hours: OpeningHours): number[] {
  const step = Math.max(1, rules.booking_interval_min);
  const out: number[] = [];
  for (let m = hours.openMin; m + rules.visit_duration_min <= hours.closeMin; m += step) out.push(m);
  return out;
}

/** 19:00 when offered, else the closest offered start (earlier wins a tie), else opening time. */
export function exampleBookingMinute(starts: number[], hours: OpeningHours): number {
  if (!starts.length) return hours.openMin;
  let best = starts[0];
  for (const m of starts) {
    if (Math.abs(m - EXAMPLE_BOOKING_MIN) < Math.abs(best - EXAMPLE_BOOKING_MIN)) best = m;
  }
  return best;
}

export type TimelineKind = "walkins_leave" | "seat_from" | "kitchen" | "start" | "hold_until" | "late_until" | "end";
export type TimelineEvent = { kind: TimelineKind; at: number };

/** Same-minute events read in this order. */
const KIND_ORDER: TimelineKind[] = ["walkins_leave", "seat_from", "kitchen", "start", "hold_until", "late_until", "end"];

/** What happens around one booking that starts at `bookingMin`, in time order. */
export function guestTimeline(rules: BookingRules, bookingMin: number, { preorder }: { preorder: boolean }): TimelineEvent[] {
  const events: TimelineEvent[] = [{ kind: "start", at: bookingMin }];
  if (rules.session_start_before_min > 0) events.push({ kind: "seat_from", at: bookingMin - rules.session_start_before_min });
  if (rules.release_before_min > 0) events.push({ kind: "walkins_leave", at: bookingMin - rules.release_before_min });
  if (preorder) events.push({ kind: "kitchen", at: bookingMin - rules.preorder_lead_min });
  if (rules.hold_minutes > 0) events.push({ kind: "hold_until", at: bookingMin + rules.hold_minutes });
  if (rules.max_late_arrival_min > rules.hold_minutes) {
    events.push({ kind: "late_until", at: bookingMin + rules.max_late_arrival_min });
  }
  events.push({ kind: "end", at: bookingMin + rules.visit_duration_min });
  return events.sort((a, b) => a.at - b.at || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

export type RuleWarningReason =
  | "default_exceeds_hours"
  | "max_exceeds_hours"
  | "hold_exceeds_duration"
  | "interval_exceeds_duration";
export type RuleWarning = { key: BookingRuleKey; reason: RuleWarningReason };

/** Valid but probably unintended combinations; the owner may still save them. */
export function ruleWarnings(rules: BookingRules, hours: OpeningHours): RuleWarning[] {
  const out: RuleWarning[] = [];
  const day = hours.closeMin - hours.openMin;
  if (rules.booking_interval_min > rules.visit_duration_min) {
    out.push({ key: "booking_interval_min", reason: "interval_exceeds_duration" });
  }
  if (rules.visit_duration_min > day) {
    out.push({ key: "visit_duration_min", reason: "default_exceeds_hours" });
  } else if (rules.max_visit_duration_min > day) {
    out.push({ key: "max_visit_duration_min", reason: "max_exceeds_hours" });
  }
  if (rules.hold_minutes > 0 && rules.hold_minutes >= rules.visit_duration_min) {
    out.push({ key: "hold_minutes", reason: "hold_exceeds_duration" });
  }
  return out;
}

/** 90 → "1 ч 30 мин", 45 → "45 мин", 120 → "2 ч". */
export function formatRuleMinutes(min: number, units: { h: string; min: string }): string {
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  if (!hours) return `${min} ${units.min}`;
  return rest ? `${hours} ${units.h} ${rest} ${units.min}` : `${hours} ${units.h}`;
}

export type SaveErrorKind = "network" | "rejected" | "session" | "forbidden" | "notPublished" | "generic";

/** Why PATCH booking-rules failed, in words for the owner (ApiError carries the HTTP status). */
export function saveErrorKind(error: unknown): SaveErrorKind {
  if (error instanceof TypeError) return "network";
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  switch (status) {
    case 400:
      return "rejected";
    case 401:
      return "session";
    case 403:
      return "forbidden";
    case 404:
      return "notPublished";
    default:
      return "generic";
  }
}
