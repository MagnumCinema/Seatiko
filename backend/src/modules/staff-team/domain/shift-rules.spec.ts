import { addDays, dayDiff, shiftMinutes, shiftsOverlap, validDate } from './shift-rules.js';

describe('shift rules', () => {
  it('parses times and dates', () => {
    expect(shiftMinutes('09:30')).toBe(570);
    expect(shiftMinutes('24:00')).toBeUndefined();
    expect(validDate('2026-11-30')).toBe(true);
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('someday')).toBe(false);
  });

  it('detects overlaps, including past midnight', () => {
    expect(shiftsOverlap('10:00', '18:00', '12:00', '20:00')).toBe(true);
    expect(shiftsOverlap('10:00', '18:00', '18:00', '23:00')).toBe(false);
    expect(shiftsOverlap('20:00', '02:00', '23:00', '23:30')).toBe(true);
  });

  it('allows split shifts on the same day with a break between them', () => {
    expect(shiftsOverlap('08:00', '12:00', '18:00', '22:00')).toBe(false);
    expect(shiftsOverlap('08:00', '12:00', '12:00', '16:00')).toBe(false);
    expect(shiftsOverlap('08:00', '12:00', '11:30', '15:30')).toBe(true);
  });

  it('moves dates by days', () => {
    expect(addDays('2026-11-30', 7)).toBe('2026-12-07');
    expect(dayDiff('2026-11-30', '2026-12-02')).toBe(2);
  });
});
