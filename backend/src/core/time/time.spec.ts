import { formatTime } from './time.js';

describe('formatTime (Go encoding/json style)', () => {
  it('trims trailing zeros of the fraction', () => {
    expect(formatTime(new Date('2026-11-25T08:28:42.838Z'), 515)).toBe('2026-11-25T08:28:42.838515Z');
    expect(formatTime(new Date('2026-11-25T08:28:42.500Z'))).toBe('2026-11-25T08:28:42.5Z');
    expect(formatTime(new Date('2026-11-25T08:28:42.000Z'))).toBe('2026-11-25T08:28:42Z');
    expect(formatTime(new Date('2026-11-25T08:28:42.000Z'), 7)).toBe('2026-11-25T08:28:42.000007Z');
  });
});
