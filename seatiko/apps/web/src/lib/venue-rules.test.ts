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

  it("keeps a zero seating lead and walk-in release the owner chose (the API stores 0 as 0)", () => {
    const rules = resolveBookingRules({ session_start_before_min: 0, release_before_min: 0 });
    expect(rules.session_start_before_min).toBe(0);
    expect(rules.release_before_min).toBe(0);
  });

  it("uses the seating defaults only when the venue has no value", () => {
    const rules = resolveBookingRules({ booking_interval_min: 30 });
    expect(rules.session_start_before_min).toBe(DEFAULT_BOOKING_RULES.session_start_before_min);
    expect(rules.release_before_min).toBe(DEFAULT_BOOKING_RULES.release_before_min);
  });

  it("reads the kitchen lead time for preorders, 0 meaning the API default of 30 min", () => {
    expect(resolveBookingRules({ preorder_lead_min: 45 }).preorder_lead_min).toBe(45);
    expect(resolveBookingRules({ preorder_lead_min: 0 }).preorder_lead_min).toBe(30);
  });
});

describe("validateBookingRules limits the API treats as 'use the default'", () => {
  it("rejects a zero announced-lateness limit, which the API would turn into 30 min", () => {
    expect(validateBookingRules({ ...DEFAULT_BOOKING_RULES, hold_minutes: 0, max_late_arrival_min: 0 })).toEqual([
      { key: "max_late_arrival_min", reason: "range" },
    ]);
  });

  it("rejects a zero kitchen lead time and one over three hours", () => {
    expect(validateBookingRules({ ...DEFAULT_BOOKING_RULES, preorder_lead_min: 0 })).toEqual([
      { key: "preorder_lead_min", reason: "range" },
    ]);
    expect(validateBookingRules({ ...DEFAULT_BOOKING_RULES, preorder_lead_min: 181 })).toEqual([
      { key: "preorder_lead_min", reason: "range" },
    ]);
  });

  it("accepts zero seating lead and walk-in release", () => {
    expect(
      validateBookingRules({ ...DEFAULT_BOOKING_RULES, session_start_before_min: 0, release_before_min: 0 }),
    ).toEqual([]);
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
