import { describe, expect, it } from "vitest";
import { MAX_RULES_PER_ROLE, sanitizeRules, sanitizeStaffing } from "./staffing-store";

describe("staffing store sanitizing", () => {
  it("keeps valid whole-day and window rules", () => {
    const rules = sanitizeRules([
      { id: "a", days: [1, 2, 3, 4, 5], min: 2 },
      { id: "b", days: [6, 7, 6], min: 3, from: "18:00", to: "23:00" },
    ]);
    expect(rules).toEqual([
      { id: "a", days: [1, 2, 3, 4, 5], min: 2 },
      { id: "b", days: [6, 7], min: 3, from: "18:00", to: "23:00" },
    ]);
  });

  it("drops broken rules, bad times and zero minimums; caps the count", () => {
    const rules = sanitizeRules([
      null,
      "x",
      { days: [], min: 2 },
      { days: [1], min: 0 },
      { days: [9, 1], min: 99, from: "25:00", to: "10:00" },
      { days: [2], min: 1, from: "10:00", to: "10:00" },
    ]);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ days: [1], min: 20 });
    expect(rules[0].from).toBeUndefined();
    expect(rules[1].from).toBeUndefined();
    expect(sanitizeRules(Array.from({ length: 10 }, () => ({ days: [1], min: 1 })))).toHaveLength(MAX_RULES_PER_ROLE);
  });

  it("ignores values that are not an object of role arrays", () => {
    expect(sanitizeStaffing(null)).toEqual({});
    expect(sanitizeStaffing([1, 2])).toEqual({});
    expect(sanitizeStaffing({ waiter: [{ days: [1], min: 1, id: "r" }], cook: "bad" })).toEqual({
      waiter: [{ id: "r", days: [1], min: 1 }],
    });
  });
});
