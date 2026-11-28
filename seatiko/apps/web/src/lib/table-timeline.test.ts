import { describe, expect, it } from "vitest";
import {
  buildTableTimeline,
  clockLabel,
  axisHours,
  gapSlots,
  minuteTop,
  scrollTargetMin,
  minuteToDate,
  nextFreeStart,
  type BusyBlock,
} from "./table-timeline";

const day = new Date(2026, 10, 28);
const at = (h: number, m = 0) => new Date(2026, 10, 28, h, m);
const iso = (h: number, m = 0) => at(h, m).toISOString();
const hours = { openMin: 12 * 60, closeMin: 23 * 60 };
const base = { day, hours, minDurationMin: 60, stepMin: 30, leadMin: 15 };

function kinds(timeline: ReturnType<typeof buildTableTimeline>) {
  return timeline.segments.map((s) => `${s.kind}:${clockLabel(s.startMin)}-${clockLabel(s.endMin)}`);
}

describe("buildTableTimeline", () => {
  it("greys closed hours, shows booked blocks and free gaps", () => {
    const busy: BusyBlock[] = [{ id: "r1", startsAt: iso(14, 30), endsAt: iso(16), kind: "RESERVATION" }];
    const timeline = buildTableTimeline({ ...base, now: at(9), busy });
    expect(timeline.closedDay).toBe(false);
    expect(kinds(timeline)).toEqual([
      "closed:10:00-12:00",
      "free:12:00-14:30",
      "busy:14:30-16:00",
      "free:16:00-23:00",
    ]);
    // Before the grid starts: no NOW line.
    expect(timeline.nowIndex).toBeNull();
  });

  it("splits the gap at now, marks the elapsed part as past and puts NOW in between", () => {
    const busy: BusyBlock[] = [{ id: "r1", startsAt: iso(14, 30), endsAt: iso(16), kind: "RESERVATION" }];
    const timeline = buildTableTimeline({ ...base, now: at(16, 15), busy });
    expect(kinds(timeline)).toEqual([
      "closed:10:00-12:00",
      "past:12:00-14:30",
      "busy:14:30-16:00",
      "past:16:00-16:15",
      "free:16:15-23:00",
    ]);
    expect(timeline.nowIndex).toBe(4);
    const free = timeline.segments[4];
    // 16:15 + 15 min lead, on the 30-min grid from opening → 16:30.
    expect(free.kind === "free" && free.firstStartMin).toBe(16 * 60 + 30);
    expect(nextFreeStart(timeline)).toBe(16 * 60 + 30);
  });

  it("flags the block a guest is seated at right now", () => {
    const busy: BusyBlock[] = [{ id: "o1", startsAt: iso(15, 40), endsAt: iso(17, 10), kind: "OCCUPIED" }];
    const timeline = buildTableTimeline({ ...base, now: at(16), busy });
    const seated = timeline.segments.find((s) => s.kind === "busy");
    expect(seated).toMatchObject({ busyKind: "seated", current: true });
    expect(timeline.segments[timeline.nowIndex!]).toBe(seated);
    expect(nextFreeStart(timeline)).toBe(17 * 60 + 30);
  });

  it("does not offer a gap too short for the shortest visit", () => {
    const busy: BusyBlock[] = [
      { id: "a", startsAt: iso(12), endsAt: iso(18), kind: "RESERVATION" },
      { id: "b", startsAt: iso(18, 45), endsAt: iso(23), kind: "RESERVATION" },
    ];
    const timeline = buildTableTimeline({ ...base, now: at(9), busy });
    const gap = timeline.segments.find((s) => s.kind === "free");
    expect(gap).toMatchObject({ startMin: 18 * 60, endMin: 18 * 60 + 45, firstStartMin: null });
    expect(nextFreeStart(timeline)).toBeNull();
  });

  it("merges overlapping bookings and clips them to opening hours", () => {
    const busy: BusyBlock[] = [
      { id: "a", startsAt: iso(11), endsAt: iso(13), kind: "RESERVATION" },
      { id: "b", startsAt: iso(12, 30), endsAt: iso(14), kind: "RESERVATION", mine: true },
    ];
    const timeline = buildTableTimeline({ ...base, now: at(9), busy });
    expect(kinds(timeline).slice(1, 3)).toEqual(["busy:12:00-14:00", "free:14:00-23:00"]);
  });

  it("marks the guest's own booking", () => {
    const busy: BusyBlock[] = [{ id: "m", startsAt: iso(19), endsAt: iso(20, 30), kind: "RESERVATION", mine: true }];
    const timeline = buildTableTimeline({ ...base, now: at(9), busy });
    expect(timeline.segments.find((s) => s.kind === "busy")).toMatchObject({ busyKind: "mine" });
  });

  it("handles a day off", () => {
    const timeline = buildTableTimeline({ ...base, hours: null, now: at(12), busy: [] });
    expect(timeline.closedDay).toBe(true);
    expect(timeline.segments).toHaveLength(0);
  });

  it("extends the grid past midnight for late venues", () => {
    const timeline = buildTableTimeline({ ...base, hours: { openMin: 18 * 60, closeMin: 26 * 60 }, now: at(9), busy: [] });
    expect(timeline.windowStartMin).toBe(10 * 60);
    expect(timeline.windowEndMin).toBe(26 * 60);
    expect(kinds(timeline)).toEqual(["closed:10:00-18:00", "free:18:00-02:00"]);
  });

  it("has nothing bookable after closing time", () => {
    const timeline = buildTableTimeline({ ...base, hours: { openMin: 12 * 60, closeMin: 22 * 60 }, now: at(22, 30), busy: [] });
    expect(nextFreeStart(timeline)).toBeNull();
    expect(timeline.segments.at(-1)?.kind).toBe("closed");
    expect(timeline.nowIndex).toBe(timeline.segments.length - 1);
  });
});

describe("day view layout", () => {
  it("places minutes and hour labels on the vertical grid", () => {
    const timeline = buildTableTimeline({ ...base, now: at(9), busy: [] });
    expect(minuteTop(10 * 60, timeline, 44)).toBe(0);
    expect(minuteTop(12 * 60 + 30, timeline, 44)).toBe(110);
    expect(axisHours(timeline).map(clockLabel)).toEqual([
      "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00",
    ]);
  });

  it("splits a free gap into tap rows; only starts that fit a visit are bookable", () => {
    const busy: BusyBlock[] = [{ id: "r1", startsAt: iso(14, 30), endsAt: iso(16), kind: "RESERVATION" }];
    const timeline = buildTableTimeline({ ...base, now: at(9), busy });
    const gap = timeline.segments[1];
    if (gap.kind !== "free") throw new Error("expected a free gap");
    const slots = gapSlots(gap, { stepMin: 30, minDurationMin: 60, openMin: 12 * 60 });
    expect(slots.map((s) => `${clockLabel(s.min)}${s.bookable ? "" : "×"}`)).toEqual([
      "12:00", "12:30", "13:00", "13:30", "14:00×",
    ]);
  });

  it("starts tap rows on the step grid after now and keeps the lead time", () => {
    const timeline = buildTableTimeline({ ...base, now: at(16, 20), busy: [] });
    const gap = timeline.segments.find((s) => s.kind === "free");
    if (!gap || gap.kind !== "free") throw new Error("expected a free gap");
    const slots = gapSlots(gap, { stepMin: 30, minDurationMin: 60, openMin: 12 * 60 });
    // 16:20 + 15 min lead → first bookable 17:00; the 16:30 row is too soon.
    expect(slots.slice(0, 3).map((s) => [clockLabel(s.min), s.bookable])).toEqual([
      ["16:30", false],
      ["17:00", true],
      ["17:30", true],
    ]);
    expect(slots.at(-1)).toEqual({ min: 22 * 60 + 30, bookable: false });
  });

  it("scrolls to now on today, else to the picked or first free start", () => {
    const today = buildTableTimeline({ ...base, now: at(16, 20), busy: [] });
    expect(scrollTargetMin(today, 19 * 60)).toBe(16 * 60 + 20);
    const later = buildTableTimeline({ ...base, now: at(9), busy: [] });
    expect(scrollTargetMin(later, 19 * 60)).toBe(19 * 60);
    expect(scrollTargetMin(later, null)).toBe(12 * 60);
    const full = buildTableTimeline({
      ...base,
      now: at(9),
      busy: [{ id: "x", startsAt: iso(12), endsAt: iso(23), kind: "RESERVATION" }],
    });
    expect(scrollTargetMin(full, null)).toBe(12 * 60);
  });
});

describe("helpers", () => {
  it("formats minutes after midnight and builds dates", () => {
    expect(clockLabel(25 * 60 + 5)).toBe("01:05");
    expect(minuteToDate(day, 19 * 60 + 30).getHours()).toBe(19);
  });
});
