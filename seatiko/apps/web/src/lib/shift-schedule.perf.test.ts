import { describe, expect, it } from "vitest";
import { addDays, datesBetween, generatePattern, scheduleProblems, type ShiftLike } from "./shift-schedule";

describe("generatePattern at venue scale", () => {
  it("plans a month for 30 people over 600 saved shifts quickly", () => {
    const members = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, role: i % 3 === 0 ? "cook" : "waiter" }));
    const existing: ShiftLike[] = [];
    for (const d of datesBetween("2026-11-01", "2026-11-30")) {
      for (let i = 0; i < 20; i++) {
        existing.push({ id: `${d}-${i}`, staff_id: `p${i}`, date: d, start_time: "10:00", end_time: "22:00", status: "CONFIRMED", role: members[i].role });
      }
    }
    const started = performance.now();
    const res = generatePattern({
      pattern: { kind: "cycle", on: 2, off: 2 },
      anchor: "2026-12-01",
      from: "2026-12-01",
      to: addDays("2026-12-01", 30),
      intervals: [{ start: "10:00", end: "22:00" }],
      members,
      teamMode: "alternate",
      continueRhythm: true,
      fillToMinimum: true,
      staffing: { waiter: [{ id: "w", days: [1, 2, 3, 4, 5, 6, 7], min: 12 }], cook: [{ id: "c", days: [6, 7], from: "18:00", to: "23:00", min: 6 }] },
      existing,
      ctx: {},
    });
    const ms = performance.now() - started;
    expect(res.accepted.length).toBeGreaterThan(300);
    expect(scheduleProblems([...existing, ...res.accepted.map((a, i) => ({ ...a.draft, id: `n${i}`, status: "PENDING" as const }))]).size).toBe(0);
    // Generous bound: this runs on every change in the generator dialog.
    expect(ms).toBeLessThan(1500);
  });
});
