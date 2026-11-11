import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING_RULES, durationOptions, resolveBookingRules, validateBookingRules } from "./venue-rules";

describe("resolveBookingRules", () => {
  it("falls back to defaults for unset values", () => {
    expect(resolveBookingRules(null)).toEqual(DEFAULT_BOOKING_RULES);
    expect(resolveBookingRules({ booking_interval_min: 0 })).toEqual(DEFAULT_BOOKING_RULES);
  });

  it("keeps owner values, including a zero no-warning lateness", () => {
    const rules = resolveBookingRules({ hold_minutes: 0, max_late_arrival_min: 20, visit_duration_min: 120 });
    expect(rules.hold_minutes).toBe(0);
    expect(rules.max_late_arrival_min).toBe(20);
    expect(rules.visit_duration_min).toBe(120);
  });

  it("never lets the announced-lateness limit drop below the hold time", () => {
    expect(resolveBookingRules({ hold_minutes: 25, max_late_arrival_min: 10 }).max_late_arrival_min).toBe(25);
  });
});

describe("validateBookingRules", () => {
  it("accepts defaults", () => {
    expect(validateBookingRules(DEFAULT_BOOKING_RULES)).toEqual([]);
  });

  it("flags out-of-range values and late limit below hold", () => {
    const errors = validateBookingRules({
      ...DEFAULT_BOOKING_RULES,
      booking_interval_min: 5,
      hold_minutes: 20,
      max_late_arrival_min: 10,
    });
    expect(errors).toEqual([
      { key: "booking_interval_min", reason: "range" },
      { key: "max_late_arrival_min", reason: "below_hold" },
    ]);
  });
});

describe("durationOptions", () => {
  it("offers half-hour steps up to the venue max and keeps the default", () => {
    expect(durationOptions(DEFAULT_BOOKING_RULES)).toEqual([60, 90, 120, 150, 180]);
    expect(durationOptions({ ...DEFAULT_BOOKING_RULES, visit_duration_min: 45, max_visit_duration_min: 120 })).toEqual([45, 60, 90, 120]);
  });

  it("flags a default longer than the max", () => {
    expect(
      validateBookingRules({ ...DEFAULT_BOOKING_RULES, visit_duration_min: 200, max_visit_duration_min: 120 }),
    ).toEqual([{ key: "visit_duration_min", reason: "above_max" }]);
  });
});
