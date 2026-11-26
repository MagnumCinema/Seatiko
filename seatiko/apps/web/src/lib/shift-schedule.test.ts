import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  checkShift,
  clockMinutes,
  copyWeekDrafts,
  datesBetween,
  dayDiff,
  daysInARow,
  findShortages,
  generatePattern,
  groupForBatch,
  hourlyHeadcount,
  inferPhase,
  isoWeekday,
  isOvernight,
  monthBounds,
  normalizeTime,
  outsideHours,
  overlappingShifts,
  parseHoursText,
  parseTime,
  personIndex,
  planShifts,
  restConflicts,
  roleDayCoverage,
  ruleCoverage,
  scheduleProblems,
  shiftMinutes,
  shiftSpan,
  shortDaysByRole,
  splitTeams,
  timesProblem,
  todayInZone,
  totalsByStaff,
  weekStart,
  worksOn,
  zonedEpochMs,
  zoneOffsetMinutes,
  type GenerateInput,
  type Pattern,
  type ShiftLike,
  type StaffingRule,
} from "./shift-schedule";

const shift = (over: Partial<ShiftLike> & Pick<ShiftLike, "date" | "start_time" | "end_time">): ShiftLike => ({
  id: `${over.staff_id ?? "m1"}-${over.date}-${over.start_time}`,
  staff_id: "m1",
  status: "CONFIRMED",
  role: "waiter",
  ...over,
});

const rule = (over: Partial<StaffingRule> = {}): StaffingRule => ({ id: "r", days: [1, 2, 3, 4, 5, 6, 7], min: 1, ...over });

describe("dates", () => {
  it("does calendar math on strings, independent of the machine time zone", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", -1)).toBe("2026-10-24");
    expect(dayDiff("2026-11-30", "2026-12-02")).toBe(2);
    expect(dayDiff("2026-12-02", "2026-11-30")).toBe(-2);
    expect(isoWeekday("2026-11-30")).toBe(1);
    expect(isoWeekday("2026-11-29")).toBe(7);
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(datesBetween("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(datesBetween("2026-12-02", "2026-12-01")).toEqual([]);
  });

  it("adds calendar months, clamping to the last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-26", 1)).toBe("2026-12-26");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(monthBounds("2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("times", () => {
  it("parses and normalizes clock times, including legacy unpadded ones", () => {
    expect(parseTime("09:30")).toBe(570);
    expect(parseTime("9:5")).toBe(545);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("10:60")).toBeNull();
    expect(parseTime("")).toBeNull();
    expect(normalizeTime("9:5")).toBe("09:05");
    expect(normalizeTime("bad")).toBe("bad");
  });

  it("rejects zero-length and unreadable hours, treats end before start as overnight", () => {
    expect(timesProblem("10:00", "10:00")).toBe("zero_length");
    expect(timesProblem("10:00", "x")).toBe("invalid_time");
    expect(timesProblem("22:00", "02:00")).toBeNull();
    expect(isOvernight("22:00", "02:00")).toBe(true);
    expect(isOvernight("10:00", "22:00")).toBe(false);
    expect(clockMinutes("22:00", "02:00")).toBe(240);
    expect(clockMinutes("10:00", "10:00")).toBe(1440);
  });
});

describe("time zone and DST (Europe/Chisinau)", () => {
  it("knows the offsets on both sides of the switches", () => {
    expect(zoneOffsetMinutes(Date.parse("2026-01-15T12:00:00Z"))).toBe(120);
    expect(zoneOffsetMinutes(Date.parse("2026-07-15T12:00:00Z"))).toBe(180);
  });

  it("maps venue-local times to instants", () => {
    expect(new Date(zonedEpochMs("2026-11-26", 10 * 60)).toISOString()).toBe("2026-11-26T08:00:00.000Z");
    expect(new Date(zonedEpochMs("2026-07-01", 10 * 60)).toISOString()).toBe("2026-07-01T07:00:00.000Z");
    // 03:30 does not exist on 29 March 2026 in Chisinau: it moves forward by the jump.
    expect(new Date(zonedEpochMs("2026-03-29", 3 * 60 + 30)).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("measures real hours of a night shift across the DST nights", () => {
    expect(shiftMinutes({ date: "2026-03-28", start_time: "22:00", end_time: "06:00" })).toBe(7 * 60);
    expect(shiftMinutes({ date: "2026-10-24", start_time: "22:00", end_time: "06:00" })).toBe(9 * 60);
    expect(shiftMinutes({ date: "2026-11-24", start_time: "22:00", end_time: "06:00" })).toBe(8 * 60);
    expect(shiftMinutes({ date: "2026-03-29", start_time: "10:00", end_time: "22:00" })).toBe(12 * 60);
  });

  it("gives today's venue date, not the UTC date", () => {
    // 23:30 UTC on 25 Nov is 01:30 on 26 Nov in Chisinau.
    expect(todayInZone(new Date("2026-11-25T23:30:00Z"))).toBe("2026-11-26");
    expect(new Date("2026-11-25T23:30:00Z").toISOString().slice(0, 10)).toBe("2026-11-25");
  });

  it("builds spans that run into the next day for overnight shifts", () => {
    const span = shiftSpan({ date: "2026-12-10", start_time: "20:00", end_time: "02:00" })!;
    expect(span.overnight).toBe(true);
    expect(new Date(span.end).toISOString()).toBe("2026-12-11T00:00:00.000Z");
    expect(shiftSpan({ date: "2026-02-30", start_time: "10:00", end_time: "12:00" })).toBeNull();
  });
});

describe("overlaps", () => {
  const existing = [
    shift({ date: "2026-12-10", start_time: "20:00", end_time: "02:00" }),
    shift({ date: "2026-12-12", start_time: "08:00", end_time: "12:00" }),
  ];

  it("finds overlaps on the same day", () => {
    expect(overlappingShifts({ staff_id: "m1", date: "2026-12-10", start_time: "18:00", end_time: "21:00" }, existing)).toHaveLength(1);
    expect(overlappingShifts({ staff_id: "m1", date: "2026-12-12", start_time: "12:00", end_time: "16:00" }, existing)).toHaveLength(0);
  });

  it("finds overlaps with the previous day's overnight shift", () => {
    const hit = overlappingShifts({ staff_id: "m1", date: "2026-12-11", start_time: "01:00", end_time: "05:00" }, existing);
    expect(hit.map((s) => s.date)).toEqual(["2026-12-10"]);
    expect(overlappingShifts({ staff_id: "m1", date: "2026-12-11", start_time: "02:00", end_time: "05:00" }, existing)).toHaveLength(0);
  });

  it("finds overlaps when a new overnight shift runs into the next day's shift", () => {
    const hit = overlappingShifts({ staff_id: "m1", date: "2026-12-11", start_time: "22:00", end_time: "09:00" }, existing);
    expect(hit.map((s) => s.date)).toEqual(["2026-12-12"]);
  });

  it("ignores declined shifts, other people and the shift being edited, but not swap requests", () => {
    const list = [
      shift({ id: "a", date: "2026-12-14", start_time: "10:00", end_time: "18:00", status: "DECLINED" }),
      shift({ id: "b", date: "2026-12-14", start_time: "10:00", end_time: "18:00", staff_id: "m2" }),
      shift({ id: "c", date: "2026-12-15", start_time: "10:00", end_time: "18:00", status: "SWAP_REQUESTED" }),
    ];
    expect(overlappingShifts({ staff_id: "m1", date: "2026-12-14", start_time: "12:00", end_time: "14:00" }, list)).toHaveLength(0);
    expect(overlappingShifts({ staff_id: "m1", date: "2026-12-15", start_time: "12:00", end_time: "14:00" }, list)).toHaveLength(1);
    expect(
      overlappingShifts({ staff_id: "m1", date: "2026-12-15", start_time: "12:00", end_time: "14:00" }, list, { ignoreIds: new Set(["c"]) }),
    ).toHaveLength(0);
  });

  it("checks one person with two memberships (two roles) as one person", () => {
    const personOf = personIndex([
      { id: "w1", email: "Doina@x.md" },
      { id: "c1", email: "doina@x.md " },
      { id: "o1", email: "other@x.md" },
    ]);
    const list = [shift({ staff_id: "w1", date: "2026-12-14", start_time: "10:00", end_time: "18:00" })];
    const draft = { staff_id: "c1", date: "2026-12-14", start_time: "16:00", end_time: "22:00" };
    expect(overlappingShifts(draft, list)).toHaveLength(0);
    expect(overlappingShifts(draft, list, { personOf })).toHaveLength(1);
    expect(overlappingShifts({ ...draft, staff_id: "o1" }, list, { personOf })).toHaveLength(0);
  });

  it("treats a split shift's back-to-back parts as fine and overlapping parts as a conflict", () => {
    const plan = planShifts(
      [
        { staff_id: "m1", date: "2026-12-20", start_time: "08:00", end_time: "12:00" },
        { staff_id: "m1", date: "2026-12-20", start_time: "11:00", end_time: "15:00" },
        { staff_id: "m1", date: "2026-12-20", start_time: "12:00", end_time: "16:00" },
      ],
      [],
    );
    expect(plan.accepted.map((a) => a.draft.start_time)).toEqual(["08:00", "12:00"]);
    expect(plan.skipped[0].reason.code).toBe("overlap");
  });

  it("detects overlaps across a DST night by real time", () => {
    const list = [shift({ date: "2026-10-24", start_time: "22:00", end_time: "03:30" })];
    // 03:00–04:00 repeats on 25 Oct; the second 03:00 is still inside the night shift.
    expect(overlappingShifts({ staff_id: "m1", date: "2026-10-25", start_time: "03:00", end_time: "07:00" }, list)).toHaveLength(1);
  });
});

describe("checkShift", () => {
  const now = new Date("2026-11-26T10:00:00Z"); // 12:00 in Chisinau

  it("blocks zero length, ended shifts, duplicates and overlaps", () => {
    expect(checkShift({ staff_id: "m1", date: "2026-12-01", start_time: "10:00", end_time: "10:00" }, []).blocking[0].code).toBe("zero_length");
    expect(checkShift({ staff_id: "m1", date: "2026-11-25", start_time: "10:00", end_time: "12:00" }, [], { now }).blocking[0].code).toBe("ended");
    const list = [shift({ date: "2026-12-01", start_time: "10:00", end_time: "22:00" })];
    expect(checkShift({ staff_id: "m1", date: "2026-12-01", start_time: "10:00", end_time: "22:00" }, list).blocking[0].code).toBe("duplicate");
    expect(checkShift({ staff_id: "m1", date: "2026-12-01", start_time: "12:00", end_time: "14:00" }, list).blocking[0].code).toBe("overlap");
  });

  it("warns (does not block) for started, long, short rest and outside opening hours", () => {
    const started = checkShift({ staff_id: "m1", date: "2026-11-26", start_time: "10:00", end_time: "22:00" }, [], { now });
    expect(started.blocking).toEqual([]);
    expect(started.warnings.map((w) => w.code)).toEqual(["started"]);

    const late = [shift({ date: "2026-12-01", start_time: "16:00", end_time: "02:00" })];
    const res = checkShift({ staff_id: "m1", date: "2026-12-02", start_time: "07:00", end_time: "23:00" }, late, {
      hours: { open: 10 * 60, close: 23 * 60 },
    });
    expect(res.blocking).toEqual([]);
    expect(res.warnings.map((w) => w.code)).toEqual(["short_rest", "long_shift", "outside_hours"]);
    expect(res.warnings[0]).toMatchObject({ restMinutes: 5 * 60 });
  });
});

describe("rest between shifts", () => {
  it("flags a closing shift followed by an opening shift", () => {
    const list = [shift({ date: "2026-12-01", start_time: "14:00", end_time: "23:00" })];
    const r = restConflicts({ staff_id: "m1", date: "2026-12-02", start_time: "08:00", end_time: "16:00" }, list);
    expect(r).toHaveLength(1);
    expect(r[0].restMinutes).toBe(9 * 60);
    expect(restConflicts({ staff_id: "m1", date: "2026-12-02", start_time: "10:00", end_time: "16:00" }, list)).toHaveLength(0);
  });

  it("flags short rest before the next day too, and counts real hours on DST nights", () => {
    const list = [shift({ date: "2026-12-03", start_time: "06:00", end_time: "14:00" })];
    expect(restConflicts({ staff_id: "m1", date: "2026-12-02", start_time: "14:00", end_time: "23:00" }, list)[0].restMinutes).toBe(7 * 60);
    // 23:00 → 09:00 is 10 h normally, 11 h when the clocks go back.
    const oct = [shift({ date: "2026-10-24", start_time: "14:00", end_time: "23:00" })];
    expect(restConflicts({ staff_id: "m1", date: "2026-10-25", start_time: "09:00", end_time: "17:00" }, oct)).toHaveLength(0);
    const nov = [shift({ date: "2026-11-24", start_time: "14:00", end_time: "23:00" })];
    expect(restConflicts({ staff_id: "m1", date: "2026-11-25", start_time: "09:00", end_time: "17:00" }, nov)).toHaveLength(1);
  });

  it("does not apply rest rules between parts of a split shift on the same date", () => {
    const list = [shift({ date: "2026-12-05", start_time: "08:00", end_time: "12:00" })];
    expect(restConflicts({ staff_id: "m1", date: "2026-12-05", start_time: "18:00", end_time: "22:00" }, list)).toHaveLength(0);
  });
});

describe("opening hours", () => {
  it("parses the venue's hours text, including past midnight", () => {
    expect(parseHoursText("Пн–Вс 10:00–23:00")).toEqual({ open: 600, close: 1380 });
    expect(parseHoursText("Пн-Вс 10:00 - 23:00")).toEqual({ open: 600, close: 1380 });
    expect(parseHoursText("12:00–01:00")).toEqual({ open: 720, close: 1500 });
    expect(parseHoursText("по договорённости")).toBeNull();
  });

  it("allows prep and cleanup time around the hours", () => {
    const hours = { open: 600, close: 1380 };
    expect(outsideHours("08:00", "16:00", hours)).toBe(false);
    expect(outsideHours("07:00", "16:00", hours)).toBe(true);
    expect(outsideHours("14:00", "01:00", hours)).toBe(false);
    expect(outsideHours("14:00", "02:00", hours)).toBe(true);
    const late = { open: 720, close: 1500 };
    expect(outsideHours("00:00", "02:00", late)).toBe(false);
    expect(outsideHours("09:00", "17:00", late)).toBe(true);
  });
});

describe("totals and saved-schedule problems", () => {
  it("sums real hours per person for a week, leaving declined shifts out", () => {
    const list = [
      shift({ date: "2026-11-23", start_time: "10:00", end_time: "22:00" }),
      shift({ date: "2026-11-29", start_time: "20:00", end_time: "02:00" }),
      shift({ date: "2026-11-30", start_time: "10:00", end_time: "22:00" }),
      shift({ date: "2026-11-24", start_time: "10:00", end_time: "22:00", status: "DECLINED" }),
    ];
    expect(totalsByStaff(list, "2026-11-23", "2026-11-29").get("m1")).toEqual({ shifts: 2, minutes: 18 * 60 });
  });

  it("marks saved shifts that overlap, have short rest or zero length", () => {
    const list = [
      shift({ id: "a", date: "2026-12-10", start_time: "20:00", end_time: "02:00" }),
      shift({ id: "b", date: "2026-12-11", start_time: "01:00", end_time: "05:00" }),
      shift({ id: "c", date: "2026-12-12", start_time: "10:00", end_time: "10:00" }),
      shift({ id: "d", date: "2026-12-20", start_time: "10:00", end_time: "18:00" }),
    ];
    const problems = scheduleProblems(list);
    expect(problems.get("a")?.overlap.map((s) => s.id)).toEqual(["b"]);
    expect(problems.get("b")?.overlap.map((s) => s.id)).toEqual(["a"]);
    expect(problems.get("c")?.zeroLength).toBe(true);
    expect(problems.has("d")).toBe(false);
  });
});

describe("staffing minimums", () => {
  const waiter = (staff: string, date: string, start: string, end: string, status: ShiftLike["status"] = "CONFIRMED") =>
    shift({ id: `${staff}-${date}-${start}`, staff_id: staff, date, start_time: start, end_time: end, status });

  it("counts people per day for whole-day rules, without declined or swap-requested shifts", () => {
    const list = [
      waiter("a", "2026-12-07", "08:00", "12:00"),
      waiter("a", "2026-12-07", "18:00", "22:00"),
      waiter("b", "2026-12-07", "10:00", "22:00", "PENDING"),
      waiter("c", "2026-12-07", "10:00", "22:00", "DECLINED"),
      waiter("d", "2026-12-07", "10:00", "22:00", "SWAP_REQUESTED"),
    ];
    const c = ruleCoverage(rule({ min: 3 }), "2026-12-07", list);
    expect(c).toMatchObject({ have: 2, need: 3, short: true });
  });

  it("finds the parts of a time window below the minimum", () => {
    const list = [waiter("a", "2026-12-07", "10:00", "22:00"), waiter("b", "2026-12-07", "18:00", "23:00")];
    const evening = ruleCoverage(rule({ from: "18:00", to: "23:00", min: 2 }), "2026-12-07", list);
    expect(evening.short).toBe(true);
    expect(evening.have).toBe(1);
    expect(evening.gaps).toEqual([{ from: 22 * 60, to: 23 * 60, have: 1 }]);
    const morning = ruleCoverage(rule({ from: "10:00", to: "14:00", min: 1 }), "2026-12-07", list);
    expect(morning.short).toBe(false);
  });

  it("covers windows past midnight with overnight shifts", () => {
    const list = [waiter("a", "2026-12-07", "20:00", "02:00")];
    expect(ruleCoverage(rule({ from: "22:00", to: "01:00", min: 1 }), "2026-12-07", list).short).toBe(false);
    expect(ruleCoverage(rule({ from: "22:00", to: "03:00", min: 1 }), "2026-12-07", list).gaps).toEqual([
      { from: 26 * 60, to: 27 * 60, have: 0 },
    ]);
  });

  it("applies rules only on their weekdays and reports short days per role", () => {
    const rules = { waiter: [rule({ days: [6, 7], min: 2 })], cook: [rule({ min: 1 })] };
    const list = [waiter("a", "2026-12-05", "10:00", "22:00"), { ...waiter("k", "2026-12-04", "10:00", "22:00"), role: "cook" }];
    const dates = datesBetween("2026-12-04", "2026-12-06"); // Fri, Sat, Sun
    const shortages = findShortages(list, dates, ["waiter", "cook"], rules);
    const byRole = shortDaysByRole(shortages);
    expect(byRole.get("waiter")).toEqual(["2026-12-05", "2026-12-06"]);
    expect(byRole.get("cook")).toEqual(["2026-12-05", "2026-12-06"]);
    expect(roleDayCoverage(list, "2026-12-04", "waiter", rules.waiter)).toMatchObject({ people: 0, need: 0, short: false });
    expect(roleDayCoverage(list, "2026-12-05", "waiter", rules.waiter)).toMatchObject({ people: 1, need: 2, short: true });
  });

  it("counts people per hour for the day timeline", () => {
    const list = [waiter("a", "2026-12-07", "10:00", "12:00"), waiter("b", "2026-12-07", "11:00", "13:30")];
    expect(hourlyHeadcount(list, "2026-12-07", "waiter", 600, 840).map((h) => h.people)).toEqual([1, 2, 1, 1]);
  });
});

describe("patterns", () => {
  const p22: Pattern = { kind: "cycle", on: 2, off: 2 };

  it("anchors 2/2 to a date so any range continues the same rhythm (no drift)", () => {
    const anchor = "2026-12-01";
    const days = datesBetween("2026-12-01", "2026-12-31").filter((d) => worksOn(p22, anchor, d));
    expect(days.slice(0, 4)).toEqual(["2026-12-01", "2026-12-02", "2026-12-05", "2026-12-06"]);
    // A later range (next month) lands on the same days as one long range.
    const january = datesBetween("2027-01-01", "2027-01-08").filter((d) => worksOn(p22, anchor, d));
    const longRun = datesBetween("2026-12-01", "2027-01-08").filter((d) => worksOn(p22, anchor, d) && d >= "2027-01-01");
    expect(january).toEqual(longRun);
    // Dates before the anchor follow the same cycle backwards.
    expect(worksOn(p22, anchor, "2026-11-30")).toBe(false);
    expect(worksOn(p22, anchor, "2026-11-28")).toBe(true);
    // Team B is two days later.
    expect(worksOn(p22, anchor, "2026-12-03", 2)).toBe(true);
    expect(worksOn(p22, anchor, "2026-12-01", 2)).toBe(false);
  });

  it("works by weekdays for 5/2-style patterns", () => {
    const wd: Pattern = { kind: "weekdays", days: [1, 2, 3, 4, 5] };
    expect(datesBetween("2026-11-30", "2026-12-06").filter((d) => worksOn(wd, "2026-11-30", d))).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
    ]);
  });

  it("infers the phase that continues someone's current rhythm", () => {
    const worked = new Set(["2026-12-27", "2026-12-28", "2026-12-31"]);
    // Worked 27, 28, off 29, 30, worked 31 → 1 Jan is their second working day.
    const phase = inferPhase(p22, "2026-12-01", worked, "2027-01-01");
    expect(phase).not.toBeNull();
    expect(worksOn(p22, "2026-12-01", "2027-01-01", phase!)).toBe(true);
    expect(worksOn(p22, "2026-12-01", "2027-01-02", phase!)).toBe(false);
    expect(inferPhase(p22, "2026-12-01", new Set(), "2027-01-01")).toBeNull();
    // Worked every day: no 2/2 rhythm to continue.
    expect(inferPhase(p22, "2026-12-01", new Set(datesBetween("2026-12-24", "2026-12-31")), "2027-01-01")).toBeNull();
    expect(inferPhase(p22, "2026-12-01", new Set(datesBetween("2026-12-28", "2026-12-31")), "2027-01-01")).toBeNull();
  });

  it("keeps a rhythm with one extra day (a top-up or a swap) but not with a messy week", () => {
    // 2/2 from 21 Dec: worked 21, 22, 25, 26, 29, 30 plus an extra 27.
    const worked = new Set(["2026-12-21", "2026-12-22", "2026-12-25", "2026-12-26", "2026-12-27", "2026-12-29", "2026-12-30"]);
    const phase = inferPhase(p22, "2026-12-01", worked, "2027-01-01");
    expect(phase).not.toBeNull();
    expect(worksOn(p22, "2026-12-01", "2027-01-02", phase!)).toBe(true);
    expect(worksOn(p22, "2026-12-01", "2027-01-01", phase!)).toBe(false);
    const messy = new Set(["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-28", "2026-12-30", "2026-12-31"]);
    expect(inferPhase(p22, "2026-12-01", messy, "2027-01-01")).toBeNull();
  });

  it("splits teams inside each role", () => {
    expect(splitTeams([["w1", "w2", "w3"], ["c1", "c2"]])).toEqual({ a: ["w1", "w3", "c1"], b: ["w2", "c2"] });
  });

  it("counts days in a row", () => {
    expect(daysInARow(new Set(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-05"]), "2026-12-02")).toBe(3);
    expect(daysInARow(new Set(["2026-12-01"]), "2026-12-04")).toBe(0);
  });
});

describe("generatePattern", () => {
  const base = (over: Partial<GenerateInput> = {}): GenerateInput => ({
    pattern: { kind: "cycle", on: 2, off: 2 },
    anchor: "2026-12-07",
    from: "2026-12-07",
    to: "2026-12-20",
    intervals: [{ start: "10:00", end: "22:00" }],
    members: [
      { id: "w1", role: "waiter" },
      { id: "w2", role: "waiter" },
    ],
    teamMode: "alternate",
    continueRhythm: true,
    fillToMinimum: false,
    staffing: {},
    existing: [],
    ctx: {},
    ...over,
  });

  it("alternates teams so the role works every day, with no overlaps", () => {
    const res = generatePattern(base());
    expect(res.accepted).toHaveLength(14);
    const byDate = new Map<string, string[]>();
    for (const a of res.accepted) byDate.set(a.draft.date, [...(byDate.get(a.draft.date) ?? []), a.draft.staff_id]);
    expect(byDate.size).toBe(14);
    expect([...byDate.values()].every((ids) => ids.length === 1)).toBe(true);
    expect(res.phases.get("w1")).toEqual({ phase: 0, source: "team_a" });
    expect(res.phases.get("w2")).toEqual({ phase: 2, source: "team_b" });
  });

  it("skips existing shifts instead of duplicating or overlapping them (regenerate is safe)", () => {
    const first = generatePattern(base());
    const saved = first.accepted.map((a, i) => ({ ...a.draft, id: `s${i}`, status: "CONFIRMED" as const }));
    const again = generatePattern(base({ existing: saved, continueRhythm: false }));
    expect(again.accepted).toHaveLength(0);
    expect(again.skipped.every((s) => s.reason.code === "duplicate")).toBe(true);

    const manual = [shift({ id: "m", staff_id: "w1", date: "2026-12-07", start_time: "18:00", end_time: "02:00" })];
    const withManual = generatePattern(base({ existing: manual }));
    // 7 Dec overlaps the manual shift; 8 Dec 10:00 starts 8 h after the night shift ends: rest is kept by skipping it.
    expect(withManual.skipped.map((s) => [s.draft.date, s.reason.code])).toEqual([
      ["2026-12-07", "overlap"],
      ["2026-12-08", "short_rest"],
    ]);
    expect(withManual.accepted.some((a) => a.draft.staff_id === "w1" && a.draft.date <= "2026-12-08")).toBe(false);
  });

  it("continues each person's rhythm next month instead of restarting from the new range", () => {
    const december = generatePattern(base({ from: "2026-12-07", to: "2026-12-31" }));
    const saved = december.accepted.map((a, i) => ({ ...a.draft, id: `d${i}`, status: "CONFIRMED" as const }));
    // Next month the owner picks 1 Jan as the start (and anchor) — the rhythm must not jump.
    const january = generatePattern(base({ anchor: "2027-01-01", from: "2027-01-01", to: "2027-01-14", existing: saved }));
    const merged = [...saved, ...january.accepted.map((a) => ({ ...a.draft, status: "PENDING" as const }))];
    for (const id of ["w1", "w2"]) {
      const days = new Set(merged.filter((s) => s.staff_id === id).map((s) => s.date));
      for (const d of datesBetween("2026-12-27", "2027-01-14")) {
        // Never more than 2 days in a row and never more than 2 days off in a row.
        expect(daysInARow(days, d)).toBeLessThanOrEqual(2);
        if (!days.has(d)) expect(days.has(addDays(d, -1)) || days.has(addDays(d, 1))).toBe(true);
      }
    }
    expect(january.phases.get("w1")?.source).toBe("rhythm");
  });

  it("keeps split shift parts and overnight templates free of overlaps", () => {
    const split = generatePattern(base({ intervals: [{ start: "09:00", end: "13:00" }, { start: "18:00", end: "22:00" }] }));
    expect(split.accepted).toHaveLength(28);
    expect(split.skipped).toHaveLength(0);
    // 22:00 → 08:00 is only 10 h: the second day of each pair is skipped whole (both parts), never half a split day.
    const tight = generatePattern(base({ intervals: [{ start: "08:00", end: "12:00" }, { start: "18:00", end: "22:00" }] }));
    const perDay = new Map<string, number>();
    for (const a of tight.accepted) perDay.set(`${a.draft.staff_id}|${a.draft.date}`, (perDay.get(`${a.draft.staff_id}|${a.draft.date}`) ?? 0) + 1);
    expect([...perDay.values()].every((n) => n === 2)).toBe(true);
    expect(tight.skipped.some((s) => s.reason.code === "short_rest")).toBe(true);
    const bad = generatePattern(base({ intervals: [{ start: "08:00", end: "14:00" }, { start: "12:00", end: "22:00" }] }));
    expect(bad.skipped.every((s) => s.reason.code === "overlap")).toBe(true);
    const night = generatePattern(base({ intervals: [{ start: "20:00", end: "08:00" }], members: [{ id: "w1", role: "waiter" }] }));
    expect(night.skipped).toHaveLength(0);
  });

  it("fills a role up to its minimum with free people, without overlaps or short rest", () => {
    const staffing = { waiter: [rule({ min: 2 })] };
    const members = ["w1", "w2", "w3", "w4"].map((id) => ({ id, role: "waiter" }));
    const plain = generatePattern(base({ members, staffing }));
    expect(plain.shortages).toHaveLength(0);
    expect(plain.filled).toBe(0);

    const three = members.slice(0, 3);
    const short = generatePattern(base({ members: three, staffing }));
    // Team A has 2 people, team B 1: the 6 team B days in these 14 are short by one.
    expect(short.shortages.length).toBe(6);
    expect(short.shortages.every((s) => s.coverage.have === 1)).toBe(true);
    const filled = generatePattern(base({ members: three, staffing, fillToMinimum: true }));
    expect(filled.filled).toBeGreaterThan(0);
    expect(filled.shortages).toHaveLength(0);
    const all = filled.accepted.map((a) => ({ ...a.draft, status: "PENDING" as const }));
    for (const a of all) expect(overlappingShifts(a, all.filter((x) => x !== a))).toHaveLength(0);
    for (const a of all) expect(restConflicts(a, all.filter((x) => x !== a))).toHaveLength(0);
    for (const m of three) {
      const days = new Set(all.filter((s) => s.staff_id === m.id).map((s) => s.date));
      for (const d of days) expect(daysInARow(days, d)).toBeLessThanOrEqual(6);
    }
  });

  it("generates what it can and reports the days that stay short", () => {
    const staffing = { waiter: [rule({ min: 3 })], cook: [rule({ days: [6, 7], min: 1 })] };
    const res = generatePattern(base({ staffing, fillToMinimum: true, members: [{ id: "w1", role: "waiter" }, { id: "c1", role: "cook" }] }));
    expect(res.accepted.length).toBeGreaterThan(0);
    const byRole = shortDaysByRole(res.shortages);
    // One waiter can never make 3: every day stays short (the waiter works 6 days at most, then rests).
    expect(byRole.get("waiter")?.length).toBe(14);
    // The cook's 2/2 misses Sunday 13 Dec; the cook is free that day, so it is filled.
    expect(byRole.has("cook")).toBe(false);
    expect(res.accepted.find((a) => a.draft.staff_id === "c1" && a.draft.date === "2026-12-13")?.filled).toBe(true);
  });

  it("does not add people who cannot help a time window", () => {
    const staffing = { waiter: [rule({ from: "22:00", to: "23:30", min: 1 })] };
    const res = generatePattern(base({ staffing, fillToMinimum: true }));
    expect(res.filled).toBe(0);
    expect(res.shortages).toHaveLength(14);
    expect(res.shortages[0].coverage.gaps).toEqual([{ from: 22 * 60, to: 23 * 60 + 30, have: 0 }]);
  });

  it("skips days that are already over", () => {
    const res = generatePattern(base({ ctx: { now: new Date("2026-12-10T21:00:00Z") } }));
    expect(res.accepted.every((a) => a.draft.date >= "2026-12-11")).toBe(true);
    expect(res.skipped.every((s) => s.reason.code === "ended")).toBe(true);
  });
});

describe("batching and copy week", () => {
  it("groups drafts into exact staff × dates requests", () => {
    const drafts = [
      { staff_id: "a", date: "2026-12-01", start_time: "10:00", end_time: "22:00" },
      { staff_id: "a", date: "2026-12-02", start_time: "10:00", end_time: "22:00" },
      { staff_id: "b", date: "2026-12-01", start_time: "10:00", end_time: "22:00" },
      { staff_id: "b", date: "2026-12-02", start_time: "10:00", end_time: "22:00" },
      { staff_id: "c", date: "2026-12-01", start_time: "10:00", end_time: "22:00" },
      { staff_id: "a", date: "2026-12-03", start_time: "18:00", end_time: "02:00", note: "бар" },
    ];
    const groups = groupForBatch(drafts);
    const expand = groups.flatMap((g) => g.staff_ids.flatMap((s) => g.dates.map((d) => `${s}|${d}|${g.start_time}|${g.end_time}|${g.note ?? ""}`)));
    expect(expand.sort()).toEqual(drafts.map((d) => `${d.staff_id}|${d.date}|${d.start_time}|${d.end_time}|${d.note ?? ""}`).sort());
    expect(groups).toHaveLength(3);
  });

  it("copies last week to this week for people still in the planner, then checks overlaps", () => {
    const list = [
      shift({ id: "1", staff_id: "a", date: "2026-11-23", start_time: "10:00", end_time: "22:00" }),
      shift({ id: "2", staff_id: "a", date: "2026-11-29", start_time: "20:00", end_time: "02:00" }),
      shift({ id: "3", staff_id: "gone", date: "2026-11-24", start_time: "10:00", end_time: "22:00" }),
      shift({ id: "4", staff_id: "a", date: "2026-11-25", start_time: "10:00", end_time: "22:00", status: "DECLINED" }),
      shift({ id: "5", staff_id: "a", date: "2026-12-07", start_time: "00:00", end_time: "06:00" }),
    ];
    const { drafts, leftOut } = copyWeekDrafts(list, "2026-11-23", "2026-11-30", (id) => (id === "a" ? "waiter" : undefined));
    expect(drafts.map((d) => d.date)).toEqual(["2026-11-30", "2026-12-06"]);
    expect(leftOut.map((s) => s.id)).toEqual(["3"]);
    // 14:00 in Chisinau on Monday 30 Nov.
    const plan = planShifts(drafts, list, { now: new Date("2026-11-30T12:00:00Z") });
    // Sunday's copied night shift (6 Dec 20:00–02:00) runs into the saved Monday 7 Dec 00:00–06:00.
    expect(plan.skipped.map((s) => [s.draft.date, s.reason.code])).toEqual([["2026-12-06", "overlap"]]);
    // Monday's copy has started already and comes 8 h after last Sunday's night shift.
    expect(plan.accepted[0].warnings.map((w) => w.code)).toEqual(["started", "short_rest"]);
  });
});
