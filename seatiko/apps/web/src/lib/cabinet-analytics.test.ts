import { describe, expect, it } from "vitest";
import type { Reservation, StaffMember, WorkShift } from "./api";
import {
  axisTicks,
  countDelta,
  formatRate,
  formatShare,
  labelEvery,
  niceMax,
  hourly,
  leadTime,
  outcomeOf,
  peakHour,
  periodRange,
  rateDelta,
  reportCsv,
  returningGuests,
  series,
  shiftLength,
  sourceShares,
  summarize,
  teamHours,
  toReportBookings,
  weekdayAverages,
  type ReportBooking,
} from "./cabinet-analytics";

const MIN = 60_000;
const HOUR = 60 * MIN;
// Thu 26 Nov 2026, 18:00 in Chișinău (UTC+2 in winter).
const NOW = Date.parse("2026-11-26T16:00:00Z");

/** A booking at venue-local "YYYY-MM-DD HH:MM" (Chișinău is UTC+2 in Nov, UTC+3 in summer). */
function at(local: string, offsetHours = 2): number {
  const [d, t] = local.split(" ");
  return Date.parse(`${d}T${t}:00Z`) - offsetHours * HOUR;
}

function b(id: string, local: string, extra: Partial<ReportBooking> = {}): ReportBooking {
  return { id, start: at(local), status: "CHECKED_IN", guests: 2, tables: [1], ...extra };
}

describe("toReportBookings", () => {
  it("keeps the fields reports need and drops rows without a valid time", () => {
    const rows = [
      {
        id: "r1",
        user_id: "u1",
        venue_id: "venue-1",
        table_id: "t1",
        table_numbers: [3, 4],
        guests: 5,
        reserved_for: "2026-11-26T17:00:00Z",
        status: "CONFIRMED",
        source: "IOS",
        created_at: "2026-11-25T10:00:00Z",
      },
      { id: "r2", user_id: "", venue_id: "venue-1", table_id: "t2", table_number: 7, guests: 2, reserved_for: "bad", status: "CONFIRMED", created_at: "" },
    ] as Reservation[];
    expect(toReportBookings(rows)).toEqual([
      {
        id: "r1",
        start: Date.parse("2026-11-26T17:00:00Z"),
        status: "CONFIRMED",
        guests: 5,
        source: "IOS",
        createdAt: Date.parse("2026-11-25T10:00:00Z"),
        userId: "u1",
        tables: [3, 4],
      },
    ]);
  });
});

describe("periodRange", () => {
  it("ends today in venue time and compares with the same number of days before", () => {
    expect(periodRange(7, NOW)).toEqual({
      days: 7,
      thisPeriod: { from: "2026-11-20", to: "2026-11-26" },
      lastPeriod: { from: "2026-11-13", to: "2026-11-19" },
    });
    // 23:30 UTC on 25 Nov is already 26 Nov in Chișinău.
    expect(periodRange(30, Date.parse("2026-11-25T23:30:00Z")).thisPeriod).toEqual({ from: "2026-10-28", to: "2026-11-26" });
  });
});

describe("outcomeOf", () => {
  it("splits bookings into arrived, not marked, still ahead, no-show and cancelled", () => {
    expect(outcomeOf(b("1", "2026-11-26 12:00", { status: "CANCELLED" }), NOW)).toBe("cancelled");
    expect(outcomeOf(b("1", "2026-11-26 12:00", { status: "NO_SHOW" }), NOW)).toBe("no_show");
    expect(outcomeOf(b("1", "2026-11-26 12:00", { status: "CHECKED_IN" }), NOW)).toBe("arrived");
    // "I'm coming" before the visit is still ahead, not an arrival.
    expect(outcomeOf(b("1", "2026-11-26 20:00", { status: "CHECKED_IN" }), NOW)).toBe("upcoming");
    expect(outcomeOf(b("1", "2026-11-26 20:00", { status: "CONFIRMED" }), NOW)).toBe("upcoming");
    // Within the 15-minute hold the guest may still come.
    expect(outcomeOf(b("1", "2026-11-26 17:50", { status: "CONFIRMED" }), NOW)).toBe("upcoming");
    expect(outcomeOf(b("1", "2026-11-26 17:40", { status: "CONFIRMED" }), NOW)).toBe("not_marked");
  });
});

const LIST: ReportBooking[] = [
  // current period 20–26 Nov
  b("a", "2026-11-20 19:00", { guests: 4 }),
  b("b", "2026-11-21 20:00", { guests: 2, status: "CANCELLED" }),
  b("c", "2026-11-21 20:30", { guests: 3, status: "NO_SHOW" }),
  b("d", "2026-11-24 13:00", { guests: 2, status: "CONFIRMED" }), // not marked
  b("e", "2026-11-26 19:30", { guests: 6, status: "CONFIRMED" }), // still ahead today
  b("f", "2026-11-26 00:30", { guests: 2 }), // just after midnight: belongs to the 26th
  // previous period 13–19 Nov
  b("p1", "2026-11-14 19:00", { guests: 2 }),
  b("p2", "2026-11-19 23:59", { guests: 4, status: "CANCELLED" }),
  // outside both
  b("x", "2026-11-12 19:00", { guests: 8 }),
  b("y", "2026-11-27 19:00", { guests: 8, status: "CONFIRMED" }),
];
const RANGE = periodRange(7, NOW);

describe("summarize", () => {
  it("counts bookings by visit day, guests without cancellations and no-shows", () => {
    expect(summarize(LIST, RANGE.thisPeriod, NOW)).toEqual({
      bookings: 6,
      covers: 14, // 4 + 2 + 6 + 2
      parties: 4,
      arrived: 2,
      notMarked: 1,
      upcoming: 1,
      noShow: 1,
      cancelled: 1,
      avgParty: 3.5,
      cancelRate: 1 / 6,
      // no-shows among visits whose time has passed: arrived 2 + not marked 1 + no-show 1
      noShowRate: 1 / 4,
    });
  });

  it("leaves averages and rates empty when nothing can be measured", () => {
    const s = summarize([], RANGE.thisPeriod, NOW);
    expect(s.bookings).toBe(0);
    expect(s.avgParty).toBeNull();
    expect(s.cancelRate).toBeNull();
    expect(s.noShowRate).toBeNull();
  });
});

describe("countDelta / rateDelta", () => {
  it("gives a relative change for counts, 'new' from zero, nothing for two zeros", () => {
    expect(countDelta(15, 10)).toEqual({ kind: "pct", value: 0.5 });
    expect(countDelta(5, 10)).toEqual({ kind: "pct", value: -0.5 });
    expect(countDelta(3, 0)).toEqual({ kind: "new" });
    expect(countDelta(0, 0)).toBeNull();
  });

  it("gives percentage points for rates, nothing when one side is unknown", () => {
    expect(rateDelta(0.25, 0.1)).toEqual({ kind: "pp", value: 15 });
    expect(rateDelta(0.1, null)).toBeNull();
    expect(rateDelta(null, 0.1)).toBeNull();
  });
});

describe("series", () => {
  it("has one point per day for a week, empty days included", () => {
    const points = series(LIST, RANGE.thisPeriod, NOW);
    expect(points.map((p) => p.key)).toEqual([
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
    ]);
    expect(points[1]).toMatchObject({ bookings: 2, covers: 0, cancelled: 1, noShow: 1 });
    expect(points[6]).toMatchObject({ bookings: 2, covers: 8, upcoming: 1, arrived: 1 });
    expect(points[2]).toMatchObject({ bookings: 0, covers: 0 });
  });

  it("groups 90 days into weeks that end today, the oldest one shorter", () => {
    const range = periodRange(90, NOW).thisPeriod;
    const points = series(LIST, range, NOW);
    expect(points).toHaveLength(13);
    expect(points[12]).toMatchObject({ from: "2026-11-20", to: "2026-11-26", bookings: 6, covers: 14 });
    expect(points[0]).toMatchObject({ from: range.from, to: "2026-09-03" });
    expect(points[0].key).toBe(range.from);
  });
});

describe("weekdayAverages", () => {
  it("averages guests per weekday over the days of the period, Monday first", () => {
    const range = periodRange(14, NOW).thisPeriod; // 13–26 Nov: every weekday twice
    const avg = weekdayAverages(LIST, range, NOW);
    expect(avg.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // Thursdays 19 and 26 Nov: 0 (19th cancelled) + 6 + 2 = 8 guests over 2 days
    expect(avg[3]).toEqual({ weekday: 4, days: 2, covers: 8, average: 4 });
    // Fridays 13 and 20 Nov: 4 guests
    expect(avg[4]).toMatchObject({ days: 2, covers: 4, average: 2 });
  });
});

describe("hourly / peakHour", () => {
  it("counts guests by the hour they are booked for, in venue time, without gaps", () => {
    const hours = hourly(LIST, RANGE.thisPeriod, NOW);
    expect(hours.map((h) => h.hour)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(hours[19]).toEqual({ hour: 19, covers: 10, bookings: 2 });
    expect(hours[13]).toEqual({ hour: 13, covers: 2, bookings: 1 });
    expect(peakHour(hours)).toEqual({ hour: 19, covers: 10, bookings: 2 });
  });

  it("is empty without guests", () => {
    expect(hourly([], RANGE.thisPeriod, NOW)).toEqual([]);
    expect(peakHour([])).toBeNull();
  });

  it("uses summer time when it applies", () => {
    const july = Date.parse("2026-07-15T16:00:00Z");
    const list = [{ ...b("s", "2026-07-15 19:00"), start: at("2026-07-15 19:00", 3) }];
    expect(hourly(list, periodRange(7, july).thisPeriod, july).map((h) => h.hour)).toEqual([19]);
  });
});

describe("sourceShares", () => {
  it("ranks where bookings come from; both apps count as the app", () => {
    const list = [
      b("1", "2026-11-25 19:00", { source: "WEB" }),
      b("2", "2026-11-25 19:00", { source: "IOS" }),
      b("3", "2026-11-25 19:00", { source: "ANDROID" }),
      b("4", "2026-11-25 19:00", { source: "PHONE" }),
      b("5", "2026-11-25 19:00"),
      b("6", "2026-11-01 19:00", { source: "WALK_IN" }),
    ];
    expect(sourceShares(list, RANGE.thisPeriod)).toEqual([
      { source: "APP", count: 2, share: 0.4 },
      { source: "WEB", count: 1, share: 0.2 },
      { source: "PHONE", count: 1, share: 0.2 },
      { source: "OTHER", count: 1, share: 0.2 },
    ]);
  });
});

describe("returningGuests", () => {
  it("counts guests of the period who had visited before", () => {
    const list = [
      b("1", "2026-11-25 19:00", { userId: "u1" }),
      b("2", "2026-11-02 19:00", { userId: "u1" }), // earlier visit
      b("3", "2026-11-25 19:00", { userId: "u2" }),
      b("4", "2026-11-03 19:00", { userId: "u2", status: "CANCELLED" }), // a cancellation is not a visit
      b("5", "2026-11-21 19:00", { userId: "u3" }),
      b("6", "2026-11-24 19:00", { userId: "u3" }), // two visits in the period
      b("7", "2026-11-24 19:00", { userId: "" }),
      b("8", "2026-11-24 19:00", { userId: "u4", source: "WALK_IN" }),
    ];
    expect(returningGuests(list, RANGE.thisPeriod)).toEqual({ guests: 3, returning: 2 });
  });
});

describe("leadTime", () => {
  it("gives the median time between booking and visit and the share booked the same day", () => {
    const list = [
      b("1", "2026-11-25 19:00", { createdAt: at("2026-11-25 17:00") }), // 2 h, same day
      b("2", "2026-11-25 19:00", { createdAt: at("2026-11-24 19:00") }), // 24 h
      b("3", "2026-11-25 19:00", { createdAt: at("2026-11-20 19:00") }), // 120 h
      b("4", "2026-11-25 19:00", { createdAt: at("2026-11-25 19:00"), source: "WALK_IN" }),
      b("5", "2026-11-25 19:00"),
    ];
    expect(leadTime(list, RANGE.thisPeriod)).toEqual({ medianHours: 24, sameDayShare: 1 / 3 });
    expect(leadTime([], RANGE.thisPeriod)).toBeNull();
  });
});

describe("shiftLength / teamHours", () => {
  it("handles shifts past midnight", () => {
    expect(shiftLength("10:00", "22:00")).toBe(12 * 60);
    expect(shiftLength("18:00", "02:00")).toBe(8 * 60);
    expect(shiftLength("09:30", "09:30")).toBe(0);
  });

  const staff: StaffMember[] = [
    { id: "s1", venue_id: "v", email: "ana@x.md", name: "Ana", role: "waiter", status: "ACTIVE", created_at: "" },
    { id: "s2", venue_id: "v", email: "ion@x.md", name: "Ion", role: "cook", status: "ACTIVE", created_at: "" },
  ];
  const shift = (id: string, staffId: string, role: string, date: string, start: string, end: string, status: WorkShift["status"] = "CONFIRMED"): WorkShift => ({
    id,
    venue_id: "v",
    staff_id: staffId,
    staff_name: staffId === "gone" ? "Former" : "",
    role,
    date,
    start_time: start,
    end_time: end,
    status,
    created_at: "",
    updated_at: "",
  });

  it("sums scheduled hours per role and per person; declined shifts are not worked", () => {
    const shifts = [
      shift("1", "s1", "waiter", "2026-11-20", "10:00", "22:00"),
      shift("2", "s1", "waiter", "2026-11-21", "18:00", "02:00", "SWAP_REQUESTED"),
      shift("3", "s1", "waiter", "2026-11-22", "10:00", "22:00", "DECLINED"),
      shift("4", "s2", "cook", "2026-11-22", "08:00", "16:00", "PENDING"),
      shift("5", "gone", "waiter", "2026-11-23", "10:00", "14:00"),
      shift("6", "s2", "cook", "2026-11-27", "08:00", "16:00"), // after the period
    ];
    const team = teamHours(shifts, staff, RANGE.thisPeriod);
    expect(team.totalHours).toBe(32);
    expect(team.shifts).toBe(4);
    expect(team.byRole).toEqual([
      { role: "waiter", hours: 24, shifts: 3, people: 2 },
      { role: "cook", hours: 8, shifts: 1, people: 1 },
    ]);
    expect(team.byPerson).toEqual([
      { staffId: "s1", name: "Ana", role: "waiter", hours: 20, shifts: 2, declined: 1, swaps: 1 },
      { staffId: "s2", name: "Ion", role: "cook", hours: 8, shifts: 1, declined: 0, swaps: 0 },
      { staffId: "gone", name: "Former", role: "waiter", hours: 4, shifts: 1, declined: 0, swaps: 0 },
    ]);
  });
});

describe("reportCsv", () => {
  it("writes a semicolon table and quotes cells that need it", () => {
    const csv = reportCsv(["Дата", "Гости"], [["2026-11-20", 4], ['Неделя; "А"', 2]]);
    expect(csv).toBe('Дата;Гости\r\n2026-11-20;4\r\n"Неделя; ""А""";2\r\n');
  });
});

describe("niceMax / axisTicks", () => {
  it("rounds the top of the axis up to a clean number", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(14)).toBe(20);
    expect(niceMax(45)).toBe(50);
    expect(niceMax(3.5)).toBe(4);
    expect(niceMax(120)).toBe(200);
  });

  it("puts a middle tick only when it is a whole number", () => {
    expect(axisTicks(4)).toEqual([0, 2, 4]);
    expect(axisTicks(1)).toEqual([0, 1]);
    expect(axisTicks(5)).toEqual([0, 5]);
  });
});

describe("labelEvery", () => {
  it("labels every column when they fit, else every n-th counted back from the last", () => {
    expect(labelEvery(7, 8)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(labelEvery(30, 6)).toEqual([4, 9, 14, 19, 24, 29]);
    expect(labelEvery(13, 7)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(labelEvery(0, 6)).toEqual([]);
  });
});

describe("formatShare / formatRate", () => {
  const nb = (text: string) => text.replace(/\u00a0|\u202f/g, " ");
  it("shows shares as whole percent, tiny ones as <1 %", () => {
    expect(nb(formatShare(0.3925, "ru-RU"))).toBe("39 %");
    expect(nb(formatShare(0.004, "ru-RU"))).toBe("<1 %");
    expect(nb(formatShare(0, "en-GB"))).toBe("0%");
  });

  it("shows rates with up to one decimal", () => {
    expect(nb(formatRate(1 / 12, "ru-RU"))).toBe("8,3 %");
    expect(nb(formatRate(0.25, "en-GB"))).toBe("25%");
  });
});
