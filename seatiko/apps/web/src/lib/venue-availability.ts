/**
 * Pilot availability search: computed in the browser from each venue's public
 * schedule. Planned replacement: server-side `GET /api/v1/availability`
 * (docs/ENGINEERING.md, "Availability search").
 */
import type { Table, VenueScheduleSlot } from "@/lib/api";
import {
  buildAnyTableSlots,
  type AnyTableSlot,
  type OpeningHours,
} from "@/lib/booking-slots";
import { durationOptions, type BookingRules } from "@/lib/venue-rules";

export type AvailabilityQuery = {
  day: Date;
  now: Date;
  guests: number;
  durationMin: number;
  /** Wanted start; null = "as soon as possible". */
  target: Date | null;
};

export type VenueAvailability = {
  /** Booking length the venue accepts closest to the requested one. */
  durationMin: number;
  /** Some table seats the party at all. */
  fits: boolean;
  /** Free start exactly at the target time. */
  exact: AnyTableSlot | null;
  /** Up to `limit` free starts closest to the target (chronological). */
  slots: AnyTableSlot[];
};

/** How far from the wanted time a free start still counts as a match. */
export const AVAILABILITY_WINDOW_MIN = 90;

/** Longest duration the venue allows that does not exceed the requested one. */
export function venueDuration(rules: BookingRules, requested: number): number {
  const options = durationOptions(rules);
  const fitting = options.filter((min) => min <= requested);
  return fitting.length ? fitting[fitting.length - 1] : options[0] ?? rules.visit_duration_min;
}

/** Free booking starts for one venue around the wanted time. */
export function venueAvailability({
  query,
  rules,
  hours,
  tables,
  schedule,
  limit = 4,
  windowMin = AVAILABILITY_WINDOW_MIN,
}: {
  query: AvailabilityQuery;
  rules: BookingRules;
  hours: OpeningHours;
  tables: Pick<Table, "id" | "seats">[];
  schedule: Pick<VenueScheduleSlot, "table_id" | "starts_at" | "ends_at">[];
  limit?: number;
  windowMin?: number;
}): VenueAvailability {
  const durationMin = venueDuration(rules, query.durationMin);
  const candidates = tables
    .filter((table) => table.seats >= query.guests)
    .map((table) => ({
      id: table.id,
      seats: table.seats,
      busy: schedule.filter((slot) => slot.table_id === table.id),
    }));
  if (candidates.length === 0) {
    return { durationMin, fits: false, exact: null, slots: [] };
  }

  const free = buildAnyTableSlots({
    day: query.day,
    now: query.now,
    hours,
    stepMin: rules.booking_interval_min,
    durationMin,
    candidates,
  }).filter((slot) => slot.available);

  if (!query.target) {
    return { durationMin, fits: true, exact: null, slots: free.slice(0, limit) };
  }

  const target = query.target.getTime();
  const near = free
    .map((slot) => ({ slot, gap: Math.abs(slot.start.getTime() - target) }))
    .filter(({ gap }) => gap <= windowMin * 60_000)
    .sort((a, b) => a.gap - b.gap || a.slot.start.getTime() - b.slot.start.getTime())
    .slice(0, limit)
    .map(({ slot }) => slot)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return {
    durationMin,
    fits: true,
    exact: near.find((slot) => slot.start.getTime() === target) ?? null,
    slots: near,
  };
}

/** Match quality for ordering results: exact time first, then the closest free start. */
export function availabilityRank(result: VenueAvailability, target: Date | null): number {
  if (!result.slots.length) return Number.POSITIVE_INFINITY;
  if (result.exact) return 0;
  const first = result.slots[0].start.getTime();
  if (!target) return first;
  return Math.min(...result.slots.map((slot) => Math.abs(slot.start.getTime() - target.getTime())));
}
