import { formatDbTime } from '../../core/time/time.js';
import type { OrderRecord } from './orders.repository.js';

const EMPTY = { ru: '', en: '', ro: '' };

/**
 * The Order JSON of the Go API with the fields computed on read: `kitchen_due` (a
 * submitted preorder whose kitchen time has come), `unavailable` lines, `venue_name`.
 */
export function presentOrder(o: OrderRecord, now: Date) {
  const kitchenDue = o.preorder && o.status === 'SUBMITTED' && o.kitchenAt !== null && now.getTime() >= new Date(formatDbTime(o.kitchenAt)).getTime();
  return {
    id: o.id,
    session_id: o.sessionId,
    ...(o.preorder ? { preorder: true } : {}),
    ...(o.reservationId ? { reservation_id: o.reservationId } : {}),
    ...(o.kitchenAt ? { kitchen_at: formatDbTime(o.kitchenAt) } : {}),
    ...(kitchenDue ? { kitchen_due: true } : {}),
    ...(o.adultItemsRemovedAt ? { adult_items_removed_at: formatDbTime(o.adultItemsRemovedAt) } : {}),
    user_id: o.userId,
    venue_id: o.venueId,
    items: o.items.map((it) => ({
      menu_item_id: it.menuItemId,
      name: it.name,
      qty: it.qty,
      price: it.price,
      ...(it.requiresAge18 ? { requires_age_18: true } : {}),
      ...(it.containsAlcohol ? { contains_alcohol: true } : {}),
      ...(it.ageCheck ? { age_check: it.ageCheck } : {}),
      ...(o.unavailable.has(it.menuItemId) ? { unavailable: true } : {}),
    })),
    status: o.status,
    total: o.total,
    ...(o.checkNumber ? { check_number: o.checkNumber } : {}),
    ...(o.paymentMethod ? { payment_method: o.paymentMethod } : {}),
    ...(o.paidAt ? { paid_at: formatDbTime(o.paidAt) } : {}),
    created_at: formatDbTime(o.createdAt),
    updated_at: formatDbTime(o.updatedAt),
    // Go's omitempty keeps an empty struct.
    venue_name: o.venueName ?? EMPTY,
  };
}

export type OrderJson = ReturnType<typeof presentOrder>;

/** Check number as Go: FA-YYYYMMDD-NNNN (orders so far + 1). */
export function checkNumber(now: Date, existing: number): string {
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `FA-${d}-${String(existing + 1).padStart(4, '0')}`;
}
