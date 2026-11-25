import { parseOpeningHours, searchAvailability, tableBusyAt, type AvailabilityTable, type AvailabilityVenue } from './availability.js';

const venue = (id: string, over: Partial<AvailabilityVenue> = {}): AvailabilityVenue => ({
  id, rating: 4.5, hoursText: 'Пн–Вс 10:00–22:00', visitDurationMin: 0, maxVisitDurationMin: 0, bookingIntervalMin: 0, holdMinutes: 0, ...over,
});
const table = (id: string, venueId: string, seats: number, over: Partial<AvailabilityTable> = {}): AvailabilityTable => ({
  id, venueId, number: Number(id.replace(/\D/g, '')), seats, status: 'FREE', occupiedSince: null, reservedFor: null, ...over,
});
// 2026-11-25 is EET (UTC+2): 10:00 local = 08:00Z.
const now = new Date('2026-11-25T06:00:00Z');

describe('parseOpeningHours', () => {
  it('reads ranges, past midnight and falls back', () => {
    expect(parseOpeningHours('Пн–Вс 10:00–22:00')).toEqual({ openMin: 600, closeMin: 1320 });
    expect(parseOpeningHours('Mon–Sun 12:00–01:00')).toEqual({ openMin: 720, closeMin: 1500 });
    expect(parseOpeningHours('')).toEqual({ openMin: 600, closeMin: 1380 });
  });
});

describe('searchAvailability', () => {
  it('gives the first free starts and the smallest fitting table', () => {
    const [r] = searchAvailability([venue('v1')], [table('t4', 'v1', 4), table('t2', 'v1', 2)], [], { day: now, guests: 2, durationMin: 0, windowMin: 0, limit: 2, now });
    expect(r).toEqual({
      venue_id: 'v1', duration_min: 90, fits: true, exact: false,
      slots: [
        { starts_at: '2026-11-25T08:00:00Z', table_id: 't2', table_number: 2 },
        { starts_at: '2026-11-25T08:30:00Z', table_id: 't2', table_number: 2 },
      ],
    });
  });

  it('skips booked windows and marks the exact match', () => {
    const blocks = [{ tableId: 't2', from: new Date('2026-11-25T15:00:00Z'), until: new Date('2026-11-25T16:30:00Z') }];
    const target = new Date('2026-11-25T15:00:00Z');
    const [r] = searchAvailability([venue('v1')], [table('t2', 'v1', 2), table('t4', 'v1', 4)], blocks, { day: target, target, guests: 2, durationMin: 0, windowMin: 30, limit: 4, now });
    expect(r.exact).toBe(true);
    expect(r.slots.find((s) => s.starts_at === '2026-11-25T15:00:00Z')?.table_id).toBe('t4');
  });

  it('ranks venues with slots first and says when nothing fits', () => {
    const out = searchAvailability([venue('small'), venue('big', { rating: 3 })], [table('t1', 'small', 2), table('t8', 'big', 8)], [], { day: now, guests: 6, durationMin: 0, windowMin: 0, limit: 1, now });
    expect(out.map((r) => [r.venue_id, r.fits, r.slots.length])).toEqual([['big', true, 1], ['small', false, 0]]);
  });

  it('offers later_today when nothing is near the wanted time', () => {
    const target = new Date('2026-11-25T23:00:00Z'); // 01:00 local, closed
    const [r] = searchAvailability([venue('v1')], [table('t2', 'v1', 2)], [], { day: now, target, guests: 2, durationMin: 0, windowMin: 30, limit: 1, now });
    expect(r.slots).toEqual([]);
    expect(r.later_today?.[0].starts_at).toBe('2026-11-25T08:00:00Z');
  });
});

describe('tableBusyAt', () => {
  it('treats an occupied table as busy for the rest of the visit', () => {
    const t = table('t1', 'v', 2, { status: 'OCCUPIED', occupiedSince: new Date('2026-11-25T05:30:00Z') });
    expect(tableBusyAt(t, [], new Date('2026-11-25T06:30:00Z'), 90 * 60_000, now, 90 * 60_000)).toBe(true);
    expect(tableBusyAt(t, [], new Date('2026-11-25T07:00:00Z'), 90 * 60_000, now, 90 * 60_000)).toBe(false);
  });
});
