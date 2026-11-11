import { describe, expect, it } from "vitest";
import { seatingRules } from "./seating-rules";

const at = new Date(2026, 10, 6, 11, 58);
const clock = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("seatingRules", () => {
  it("flags early seating that depends on the table being free", () => {
    const rules = seatingRules(at, 15, 10);
    expect(clock(rules.walkInUntil)).toBe("11:48");
    expect(clock(rules.ownerFrom)).toBe("11:43");
    expect(rules.ownerFromNeedsFreeTable).toBe(true);
  });

  it("has no condition when walk-ins leave before the booked guest may sit", () => {
    const rules = seatingRules(at, 10, 15);
    expect(clock(rules.walkInUntil)).toBe("11:43");
    expect(clock(rules.ownerFrom)).toBe("11:48");
    expect(rules.ownerFromNeedsFreeTable).toBe(false);
  });
});
