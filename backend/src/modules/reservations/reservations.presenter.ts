import { formatDbTime } from '../../core/time/time.js';
import type { OrderJson } from '../orders/order.presenter.js';
import type { HeldTable, ReservationRow } from './reservations.repository.js';

const EMPTY = { ru: '', en: '', ro: '' };

/**
 * The Reservation JSON of the Go API: held tables (`table_ids`, `table_number`,
 * `table_numbers`), the venue name and the active preorder when known.
 */
export function presentReservation(
  r: ReservationRow,
  held: HeldTable[],
  extra: { venueName?: { ru: string; en: string; ro: string } | null; preorder?: OrderJson } = {},
) {
  const mine = held.filter((h) => h.reservationId === r.id);
  const primary = mine.find((h) => h.tableId === r.tableId);
  const numbers = [primary, ...mine.filter((h) => h.tableId !== r.tableId)].flatMap((h) => (h?.number ? [h.number] : []));
  return {
    id: r.id,
    user_id: r.userId,
    venue_id: r.venueId,
    table_id: r.tableId,
    ...(mine.length ? { table_ids: mine.map((h) => h.tableId) } : {}),
    guests: r.guests,
    reserved_for: formatDbTime(r.reservedFor),
    ...(r.durationMin ? { duration_min: r.durationMin } : {}),
    status: r.status,
    source: r.source,
    ...(r.notes ? { notes: r.notes } : {}),
    ...(r.arrivalConfirmedAt ? { arrival_confirmed_at: formatDbTime(r.arrivalConfirmedAt) } : {}),
    ...(r.expectedArrival ? { expected_arrival: formatDbTime(r.expectedArrival) } : {}),
    created_at: formatDbTime(r.createdAt),
    updated_at: formatDbTime(r.updatedAt),
    ...(extra.preorder ? { preorder: extra.preorder } : {}),
    // Go's omitempty keeps an empty struct.
    venue_name: extra.venueName ?? EMPTY,
    ...(primary?.number ? { table_number: primary.number } : {}),
    ...(numbers.length ? { table_numbers: numbers } : {}),
  };
}
