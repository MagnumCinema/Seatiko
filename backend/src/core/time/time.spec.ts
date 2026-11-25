import { formatTime } from './time.js';

describe('formatTime (Go encoding/json style)', () => {
  it('trims trailing zeros of the fraction', () => {
    expect(formatTime(new Date('2026-11-25T08:28:42.838Z'), 515)).toBe('2026-11-25T08:28:42.838515Z');
    expect(formatTime(new Date('2026-11-25T08:28:42.500Z'))).toBe('2026-11-25T08:28:42.5Z');
    expect(formatTime(new Date('2026-11-25T08:28:42.000Z'))).toBe('2026-11-25T08:28:42Z');
    expect(formatTime(new Date('2026-11-25T08:28:42.000Z'), 7)).toBe('2026-11-25T08:28:42.000007Z');
  });
});

describe('formatDbTime', () => {
  it('keeps microseconds and normalises the offset', async () => {
    const { formatDbTime } = await import('./time.js');
    expect(formatDbTime('2026-11-25 08:28:42.838515+00')).toBe('2026-11-25T08:28:42.838515Z');
    expect(formatDbTime('2026-11-25 10:28:42.5+02')).toBe('2026-11-25T08:28:42.5Z');
    expect(formatDbTime('2026-11-25 08:28:42+00')).toBe('2026-11-25T08:28:42Z');
  });
});

describe('venue time zone', () => {
  it('converts Chisinau wall time to UTC across DST', async () => {
    const { venueLocalTime, venueLocalParts } = await import('./time.js');
    expect(venueLocalTime(2026, 11, 25, 10 * 60).toISOString()).toBe('2026-11-25T08:00:00.000Z'); // EET +2
    expect(venueLocalTime(2026, 7, 1, 10 * 60).toISOString()).toBe('2026-07-01T07:00:00.000Z'); // EEST +3
    expect(venueLocalTime(2026, 11, 25, 25 * 60).toISOString()).toBe('2026-11-25T23:00:00.000Z'); // 01:00 next day
    expect(venueLocalParts(new Date('2026-11-25T22:30:00Z'))).toMatchObject({ year: 2026, month: 11, day: 26, hour: 0, minute: 30 });
  });
});
