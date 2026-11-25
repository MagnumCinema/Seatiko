// Public busy board of a venue (no guest data), ported from ListVenueSchedule in Go.
import { formatTime } from '../../../core/time/time.js';
import { type AvailabilityTable, occupiedUntil } from './availability.js';

const MIN = 60_000;

export type ScheduleReservation = {
  id: string;
  tableId: string;
  tableNumber: number;
  reservedFor: Date;
  expectedArrival: Date | null;
  /** Booking length in minutes (venue default already applied). */
  durationMin: number;
};

export type ScheduleSlot = { id: string; table_id: string; table_number: number; starts_at: string; ends_at: string; kind: 'RESERVATION' | 'OCCUPIED' };

export function venueSchedule(reservations: ScheduleReservation[], tables: AvailabilityTable[], visitMin: number, now: Date): ScheduleSlot[] {
  const visit = visitMin * MIN;
  const slots: Array<{ id: string; tableId: string; tableNumber: number; start: number; end: number; kind: ScheduleSlot['kind'] }> = [];

  for (const r of reservations) {
    const start = r.reservedFor.getTime();
    const from = r.expectedArrival && r.expectedArrival.getTime() > start ? r.expectedArrival.getTime() : start;
    slots.push({ id: r.id, tableId: r.tableId, tableNumber: r.tableNumber, start, end: from + r.durationMin * MIN, kind: 'RESERVATION' });
  }
  // A reserved table whose booking record is gone still shows on the board.
  for (const t of tables) {
    if (t.status !== 'RESERVED' || !t.reservedFor) continue;
    const start = t.reservedFor.getTime();
    if (slots.some((s) => s.tableId === t.id && s.start === start)) continue;
    slots.push({ id: `res-${t.id}`, tableId: t.id, tableNumber: t.number, start, end: start + visit, kind: 'RESERVATION' });
  }
  // Guests seated right now.
  for (const t of tables) {
    if (t.status !== 'OCCUPIED') continue;
    const end = occupiedUntil(t, now, visit).getTime();
    let start = end - visit;
    if (t.occupiedSince && t.occupiedSince.getTime() < start) start = t.occupiedSince.getTime();
    if (start < now.getTime() - 12 * 60 * MIN) start = now.getTime() - visit;
    if (slots.some((s) => s.tableId === t.id && end >= s.start && start <= s.end)) continue;
    slots.push({ id: `occ-${t.id}`, tableId: t.id, tableNumber: t.number, start, end, kind: 'OCCUPIED' });
  }

  return slots
    .sort((a, b) => a.start - b.start)
    .map((s) => ({
      id: s.id,
      table_id: s.tableId,
      table_number: s.tableNumber,
      starts_at: formatTime(new Date(s.start)),
      ends_at: formatTime(new Date(s.end)),
      kind: s.kind,
    }));
}
