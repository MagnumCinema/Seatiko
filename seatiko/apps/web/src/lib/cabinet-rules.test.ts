import { describe, expect, it } from "vitest";
import {
  changedRuleKeys,
  dailyStartTimes,
  exampleBookingMinute,
  formatRuleMinutes,
  guestTimeline,
  intervalChoices,
  parseRuleInput,
  previewRules,
  ruleWarnings,
  saveErrorKind,
  stepRuleValue,
} from "./cabinet-rules";
import { DEFAULT_BOOKING_RULES, type BookingRules } from "./venue-rules";

const HOURS_10_22 = { openMin: 10 * 60, closeMin: 22 * 60 };
const rules = (patch: Partial<BookingRules> = {}): BookingRules => ({ ...DEFAULT_BOOKING_RULES, ...patch });

describe("parseRuleInput", () => {
  it("reads whole minutes and treats anything else as empty", () => {
    expect(parseRuleInput("45")).toBe(45);
    expect(parseRuleInput(" 090 ")).toBe(90);
    expect(parseRuleInput("")).toBeNaN();
    expect(parseRuleInput("1.5")).toBeNaN();
    expect(parseRuleInput("-5")).toBeNaN();
  });
});

describe("stepRuleValue", () => {
  it("moves to the next step and snaps odd values onto the grid", () => {
    expect(stepRuleValue("hold_minutes", 15, 1)).toBe(20);
    expect(stepRuleValue("hold_minutes", 17, 1)).toBe(20);
    expect(stepRuleValue("hold_minutes", 17, -1)).toBe(15);
    expect(stepRuleValue("visit_duration_min", 90, 1)).toBe(105);
    expect(stepRuleValue("max_visit_duration_min", 180, -1)).toBe(150);
  });

  it("stays inside the allowed range", () => {
    expect(stepRuleValue("hold_minutes", 0, -1)).toBe(0);
    expect(stepRuleValue("hold_minutes", 60, 1)).toBe(60);
    expect(stepRuleValue("max_visit_duration_min", 60, -1)).toBe(60);
    expect(stepRuleValue("max_late_arrival_min", 5, -1)).toBe(5);
  });

  it("starts an empty field from its lower limit", () => {
    expect(stepRuleValue("visit_duration_min", Number.NaN, 1)).toBe(30);
    expect(stepRuleValue("visit_duration_min", Number.NaN, -1)).toBe(30);
  });
});

describe("intervalChoices", () => {
  it("offers the common steps and keeps a custom value the venue already has", () => {
    expect(intervalChoices(30)).toEqual([15, 20, 30, 45, 60, 90, 120]);
    expect(intervalChoices(25)).toEqual([15, 20, 25, 30, 45, 60, 90, 120]);
    expect(intervalChoices(Number.NaN)).toEqual([15, 20, 30, 45, 60, 90, 120]);
  });
});

describe("changedRuleKeys", () => {
  it("lists only the rules that differ", () => {
    expect(changedRuleKeys(rules(), rules())).toEqual([]);
    expect(changedRuleKeys(rules(), rules({ hold_minutes: 10, preorder_lead_min: 45 }))).toEqual([
      "hold_minutes",
      "preorder_lead_min",
    ]);
  });
});

describe("previewRules", () => {
  it("shows typed values and keeps the saved one for a field that is empty or out of range", () => {
    const saved = rules();
    const draft = rules({ hold_minutes: 10, booking_interval_min: Number.NaN, visit_duration_min: 999 });
    expect(previewRules(draft, saved)).toEqual(rules({ hold_minutes: 10 }));
  });

  it("evens out a half-edited pair the way guests would get it", () => {
    const saved = rules();
    expect(previewRules(rules({ hold_minutes: 40, max_late_arrival_min: 30 }), saved).max_late_arrival_min).toBe(40);
    expect(previewRules(rules({ visit_duration_min: 120, max_visit_duration_min: 90 }), saved).visit_duration_min).toBe(90);
  });
});

describe("dailyStartTimes", () => {
  it("steps through opening hours so the default booking still ends by closing", () => {
    const starts = dailyStartTimes(rules({ booking_interval_min: 60, visit_duration_min: 120 }), HOURS_10_22);
    expect(starts[0]).toBe(10 * 60);
    expect(starts.at(-1)).toBe(20 * 60);
    expect(starts).toHaveLength(11);
  });

  it("returns nothing when the default booking is longer than the day", () => {
    expect(dailyStartTimes(rules({ visit_duration_min: 360 }), { openMin: 18 * 60, closeMin: 22 * 60 })).toEqual([]);
  });

  it("follows hours that pass midnight", () => {
    const starts = dailyStartTimes(rules({ booking_interval_min: 60, visit_duration_min: 60 }), {
      openMin: 20 * 60,
      closeMin: 26 * 60,
    });
    expect(starts).toEqual([20 * 60, 21 * 60, 22 * 60, 23 * 60, 24 * 60, 25 * 60]);
  });
});

describe("exampleBookingMinute", () => {
  it("prefers 19:00, then the closest start, then opening time", () => {
    expect(exampleBookingMinute([18 * 60, 19 * 60, 20 * 60], HOURS_10_22)).toBe(19 * 60);
    expect(exampleBookingMinute([10 * 60, 18 * 60 + 45, 19 * 60 + 15], HOURS_10_22)).toBe(18 * 60 + 45);
    expect(exampleBookingMinute([], HOURS_10_22)).toBe(10 * 60);
  });
});

describe("guestTimeline", () => {
  it("orders what happens around a booking", () => {
    const events = guestTimeline(rules(), 19 * 60, { preorder: true });
    expect(events).toEqual([
      { kind: "seat_from", at: 18 * 60 },
      { kind: "kitchen", at: 18 * 60 + 30 },
      { kind: "walkins_leave", at: 18 * 60 + 45 },
      { kind: "start", at: 19 * 60 },
      { kind: "hold_until", at: 19 * 60 + 15 },
      { kind: "late_until", at: 19 * 60 + 30 },
      { kind: "end", at: 20 * 60 + 30 },
    ]);
  });

  it("drops steps that do not apply", () => {
    const events = guestTimeline(
      rules({ hold_minutes: 0, max_late_arrival_min: 0, session_start_before_min: 0, release_before_min: 0 }),
      19 * 60,
      { preorder: false },
    );
    expect(events.map((e) => e.kind)).toEqual(["start", "end"]);
  });

  it("puts walk-ins leaving before seating when both happen at once", () => {
    const events = guestTimeline(
      rules({ session_start_before_min: 15, release_before_min: 15 }),
      19 * 60,
      { preorder: false },
    );
    expect(events.slice(0, 2).map((e) => e.kind)).toEqual(["walkins_leave", "seat_from"]);
  });
});

describe("ruleWarnings", () => {
  it("is quiet for the defaults", () => {
    expect(ruleWarnings(rules(), HOURS_10_22)).toEqual([]);
  });

  it("warns when the default booking does not fit in a working day", () => {
    expect(ruleWarnings(rules({ visit_duration_min: 300 }), { openMin: 18 * 60, closeMin: 22 * 60 })).toEqual([
      { key: "visit_duration_min", reason: "default_exceeds_hours" },
    ]);
  });

  it("warns when the longest booking does not fit in a working day", () => {
    expect(ruleWarnings(rules({ max_visit_duration_min: 300 }), { openMin: 18 * 60, closeMin: 22 * 60 })).toEqual([
      { key: "max_visit_duration_min", reason: "max_exceeds_hours" },
    ]);
  });

  it("warns when the table waits for a late guest as long as the booking lasts", () => {
    expect(ruleWarnings(rules({ visit_duration_min: 45, hold_minutes: 45, max_late_arrival_min: 45 }), HOURS_10_22)).toEqual([
      { key: "hold_minutes", reason: "hold_exceeds_duration" },
    ]);
  });

  it("warns when the time step is longer than the default booking", () => {
    expect(ruleWarnings(rules({ booking_interval_min: 120, visit_duration_min: 60 }), HOURS_10_22)).toEqual([
      { key: "booking_interval_min", reason: "interval_exceeds_duration" },
    ]);
  });
});

describe("formatting", () => {
  const units = { h: "ч", min: "мин" };
  it("shows minutes as hours and minutes", () => {
    expect(formatRuleMinutes(0, units)).toBe("0 мин");
    expect(formatRuleMinutes(45, units)).toBe("45 мин");
    expect(formatRuleMinutes(60, units)).toBe("1 ч");
    expect(formatRuleMinutes(90, units)).toBe("1 ч 30 мин");
    expect(formatRuleMinutes(480, units)).toBe("8 ч");
  });
});

describe("saveErrorKind", () => {
  it("tells the owner why the rules were not saved", () => {
    expect(saveErrorKind({ status: 400, code: "bad_request" })).toBe("rejected");
    expect(saveErrorKind({ status: 401, code: "unauthorized" })).toBe("session");
    expect(saveErrorKind({ status: 403, code: "forbidden" })).toBe("forbidden");
    expect(saveErrorKind({ status: 404, code: "not_found" })).toBe("notPublished");
    expect(saveErrorKind({ status: 502, code: "http_502" })).toBe("generic");
    expect(saveErrorKind(new TypeError("Failed to fetch"))).toBe("network");
    expect(saveErrorKind(new Error("boom"))).toBe("generic");
  });
});
