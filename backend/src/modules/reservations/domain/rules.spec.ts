import { bookingDuration, bookingSource, bookingWindow, maxLateArrivalMinutes, mergePreorderLines, preorderKitchenAt } from './rules.js';

const venue = { visitDurationMin: 0, maxVisitDurationMin: 0, bookingIntervalMin: 0, holdMinutes: 15, maxLateArrivalMin: 0, preorderLeadMin: 0 };

describe('booking rules', () => {
  it('uses the venue default length and refuses lengths out of range', () => {
    expect(bookingDuration(venue, 0)).toBe(90);
    expect(bookingDuration(venue, 120)).toBe(120);
    expect(bookingDuration(venue, 20)).toBeUndefined();
    expect(bookingDuration(venue, 240)).toBeUndefined();
  });

  it('late arrival limit is never below the hold', () => {
    expect(maxLateArrivalMinutes(venue)).toBe(30);
    expect(maxLateArrivalMinutes({ ...venue, holdMinutes: 45 })).toBe(45);
  });

  it('a late arrival extends the window', () => {
    const at = new Date('2026-11-26T16:00:00Z');
    expect(bookingWindow(at, null, 90)).toEqual({ from: at, until: new Date('2026-11-26T17:30:00Z') });
    expect(bookingWindow(at, new Date('2026-11-26T16:20:00Z'), 90).until).toEqual(new Date('2026-11-26T17:50:00Z'));
  });

  it('normalises the source', () => {
    expect(bookingSource('android')).toBe('ANDROID');
    expect(bookingSource('telegram')).toBe('WEB');
  });
});

describe('preorder rules', () => {
  it('kitchen starts 30 minutes before by default', () => {
    expect(preorderKitchenAt(new Date('2026-11-26T16:00:00Z'), venue)).toEqual(new Date('2026-11-26T15:30:00Z'));
  });

  it('merges repeated dishes and validates quantities', () => {
    expect(mergePreorderLines([{ menu_item_id: 'm1', qty: 2 }, { menu_item_id: 'm2', qty: 1 }, { menu_item_id: 'm1', qty: 1 }])).toEqual([{ id: 'm1', qty: 3 }, { id: 'm2', qty: 1 }]);
    expect(mergePreorderLines([])).toBeUndefined();
    expect(mergePreorderLines([{ menu_item_id: 'm1', qty: 0 }])).toBeUndefined();
    expect(mergePreorderLines([{ menu_item_id: 'm1', qty: 15 }, { menu_item_id: 'm1', qty: 15 }])).toEqual([{ id: 'm1', qty: 20 }]);
  });
});
