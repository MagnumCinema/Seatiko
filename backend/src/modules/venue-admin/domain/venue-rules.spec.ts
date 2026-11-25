import { clampX, clampY, validBookingRules } from './venue-rules.js';

const base = { bookingIntervalMin: 30, holdMinutes: 15, preorderLeadMin: 30, sessionStartBeforeMin: 60, releaseBeforeMin: 15, maxLateArrivalMin: 30, visitDurationMin: 90, maxVisitDurationMin: 180 };

describe('booking rules', () => {
  it('accepts defaults and zeros', () => {
    expect(validBookingRules(base)).toBe(true);
    expect(validBookingRules({ ...base, bookingIntervalMin: 0, visitDurationMin: 0, maxLateArrivalMin: 0 })).toBe(true);
  });

  it('refuses out-of-range values and contradictions', () => {
    expect(validBookingRules({ ...base, bookingIntervalMin: 1 })).toBe(false);
    expect(validBookingRules({ ...base, holdMinutes: 61 })).toBe(false);
    expect(validBookingRules({ ...base, preorderLeadMin: 200 })).toBe(false);
    expect(validBookingRules({ ...base, maxLateArrivalMin: 10, holdMinutes: 15 })).toBe(false);
    expect(validBookingRules({ ...base, visitDurationMin: 240, maxVisitDurationMin: 180 })).toBe(false);
  });

  it('keeps tables off the plan edges', () => {
    expect([clampX(0), clampX(1), clampY(0), clampY(1), clampX(0.5)]).toEqual([0.08, 0.92, 0.12, 0.88, 0.5]);
  });
});
