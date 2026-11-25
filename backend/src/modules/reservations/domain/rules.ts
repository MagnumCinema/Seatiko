// Booking and preorder rules ported from store/memory.go, booking_rules.go and preorder.go.
import { maxVisitMinutes, MIN_VISIT_DURATION_MIN, visitMinutes, type BookingRules } from '../../catalog/domain/booking-rules.js';

const MIN = 60_000;

/** A guest may hold one active booking (confirmed or checked in, from 3 h ago on). */
export const ACTIVE_BOOKING_LOOKBACK_MS = 3 * 3600_000;
export const DEFAULT_MAX_LATE_ARRIVAL_MIN = 30;
export const DEFAULT_PREORDER_LEAD_MIN = 30;
export const MAX_PREORDER_LINES = 30;
export const MAX_PREORDER_QTY = 20;
export const AGE_CHECK_PENDING = 'PENDING_AGE_CHECK';

export type VenueRules = BookingRules & { maxLateArrivalMin: number; preorderLeadMin: number };

/** Booking length: the guest's choice (0 = venue default), within [30 min, venue max]. Undefined when invalid. */
export function bookingDuration(v: BookingRules, requested: number): number | undefined {
  const d = requested === 0 ? visitMinutes(v) : requested;
  return d < MIN_VISIT_DURATION_MIN || d > maxVisitMinutes(v) ? undefined : d;
}

/** How late "I'm coming" may announce arriving; never less than the hold time. */
export function maxLateArrivalMinutes(v: VenueRules): number {
  const limit = v.maxLateArrivalMin > 0 ? v.maxLateArrivalMin : DEFAULT_MAX_LATE_ARRIVAL_MIN;
  return Math.max(limit, v.holdMinutes);
}

/** The window a booking holds its tables: [reserved_for, max(reserved_for, arrival) + duration). */
export function bookingWindow(reservedFor: Date, expectedArrival: Date | null, durationMin: number): { from: Date; until: Date } {
  const from = expectedArrival && expectedArrival > reservedFor ? expectedArrival : reservedFor;
  return { from: reservedFor, until: new Date(from.getTime() + durationMin * MIN) };
}

/** Postgres tstzrange literal for a window. */
export const tstzrange = (w: { from: Date; until: Date }) => `[${w.from.toISOString()},${w.until.toISOString()})`;

const SOURCES = ['ANDROID', 'IOS', 'PHONE', 'WALK_IN'];
/** WEB unless the client says ANDROID, IOS, PHONE or WALK_IN. */
export function bookingSource(raw?: string): string {
  const s = (raw ?? '').toUpperCase();
  return SOURCES.includes(s) ? s : 'WEB';
}

/** When the kitchen starts a preorder: reserved_for − lead (default 30 min). */
export function preorderKitchenAt(reservedFor: Date, v: Pick<VenueRules, 'preorderLeadMin'>): Date {
  const lead = v.preorderLeadMin > 0 ? v.preorderLeadMin : DEFAULT_PREORDER_LEAD_MIN;
  return new Date(reservedFor.getTime() - lead * MIN);
}

/** Merge repeated dishes, keep the guest's order of lines; undefined when a quantity or the line count is invalid. */
export function mergePreorderLines(items: Array<{ menu_item_id: string; qty: number }>): Array<{ id: string; qty: number }> | undefined {
  const qty = new Map<string, number>();
  for (const it of items) {
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_PREORDER_QTY) return undefined;
    qty.set(it.menu_item_id, (qty.get(it.menu_item_id) ?? 0) + it.qty);
  }
  if (qty.size === 0 || qty.size > MAX_PREORDER_LINES) return undefined;
  return [...qty].map(([id, n]) => ({ id, qty: Math.min(n, MAX_PREORDER_QTY) }));
}

/** 18+ items: marked so, or containing alcohol. */
export const requiresAge18 = (item: { requiresAge18: boolean; containsAlcohol: boolean }) => item.requiresAge18 || item.containsAlcohol;
