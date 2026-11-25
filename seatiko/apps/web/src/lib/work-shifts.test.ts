import { describe, expect, it } from "vitest";
import type { WorkShift } from "@/lib/api";
import {
  calcDurationMinutes,
  findShiftConflict,
  getMemberActiveDayShifts,
  shiftsOverlap,
  splitIntervalsOverlap,
  suggestNextShiftSlot,
} from "./work-shifts";

function makeShift(overrides: Partial<WorkShift>): WorkShift {
  return {
    id: "s1",
    venue_id: "v1",
    staff_id: "m1",
    staff_name: "Alex",
    role: "waiter",
    date: "2026-11-25",
    start_time: "08:00",
    end_time: "12:00",
    status: "CONFIRMED",
    created_at: "2026-11-25T00:00:00Z",
    updated_at: "2026-11-25T00:00:00Z",
    ...overrides,
  };
}

describe("work-shifts split shift helpers", () => {
  it("allows non-overlapping morning + evening 4h shifts on the same day", () => {
    expect(shiftsOverlap("08:00", "12:00", "18:00", "22:00")).toBe(false);
    expect(splitIntervalsOverlap("08:00", "12:00", "18:00", "22:00")).toBe(false);
    expect(calcDurationMinutes("08:00", "12:00") + calcDurationMinutes("18:00", "22:00")).toBe(480);

    const morning = makeShift({ id: "s1", start_time: "08:00", end_time: "12:00" });
    expect(findShiftConflict([morning], "m1", "2026-11-25", "18:00", "22:00")).toBeUndefined();
    expect(findShiftConflict([morning], "m1", "2026-11-25", "11:00", "15:00")?.id).toBe("s1");
  });

  it("suggests evening 4h slot when morning shift already exists and vice versa", () => {
    expect(suggestNextShiftSlot([])).toEqual({ start: "10:00", end: "22:00" });
    expect(suggestNextShiftSlot([{ start_time: "08:00", end_time: "12:00" }])).toEqual({
      start: "18:00",
      end: "22:00",
    });
    expect(suggestNextShiftSlot([{ start_time: "18:00", end_time: "22:00" }])).toEqual({
      start: "08:00",
      end: "12:00",
    });
  });

  it("ignores declined shifts when finding active day shifts and conflicts", () => {
    const declined = makeShift({ id: "s1", start_time: "08:00", end_time: "12:00", status: "DECLINED" });
    const pending = makeShift({ id: "s2", start_time: "18:00", end_time: "22:00", status: "PENDING" });
    expect(getMemberActiveDayShifts([pending, declined], "m1", "2026-11-25").map((s) => s.id)).toEqual(["s2"]);
    expect(findShiftConflict([declined], "m1", "2026-11-25", "08:00", "12:00")).toBeUndefined();
  });
});
