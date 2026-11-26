import { describe, expect, it } from "vitest";
import { parseOpeningHours } from "./booking-slots";
import {
  bookingRange,
  closesNextDay,
  defaultWeek,
  describeHours,
  formatClock,
  formatHoursText,
  hoursOnWeekday,
  hoursVaryByDay,
  isRoundTheClock,
  parseClock,
  parseHoursText,
  venueHoursLabel,
  venueHoursOn,
  venueOpeningHours,
  weekdayIndex,
  type DayHours,
  type WeekHours,
} from "./venue-hours";

describe("venueOpeningHours", () => {
  it("uses the hours the venue publishes, like the server availability does", () => {
    expect(venueOpeningHours({ id: "venue-new", hours_text: "Пн–Вс 08:00–20:00" })).toEqual({
      openMin: 8 * 60,
      closeMin: 20 * 60,
    });
  });

  it("falls back to the bundled demo hours, then to 10:00–23:00", () => {
    expect(venueOpeningHours({ id: "venue-1" })).toEqual({ openMin: 10 * 60, closeMin: 22 * 60 });
    expect(venueOpeningHours({ id: "venue-new", hours_text: "  " })).toEqual({ openMin: 10 * 60, closeMin: 23 * 60 });
  });
});

const open = (from: string, to: string): DayHours => ({ closed: false, open: parseClock(from)!, close: parseClock(to)! });
const closed: DayHours = { closed: true };
const week = (...days: DayHours[]): WeekHours => days;
const all = (day: DayHours) => Array.from({ length: 7 }, () => day);

const RU = { days: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], closed: "выходной", roundTheClock: "круглосуточно", everyDay: "Ежедневно" };
const EN = { days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], closed: "closed", roundTheClock: "24 hours", everyDay: "Daily" };

describe("clock", () => {
  it("formats and parses minutes", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(605)).toBe("10:05");
    expect(parseClock("9:30")).toBe(570);
    expect(parseClock("24:00")).toBe(0);
    expect(parseClock("10.15")).toBe(615);
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("10:60")).toBeNull();
    expect(parseClock("")).toBeNull();
  });
});

describe("parseHoursText", () => {
  it("reads the demo lines in all three languages", () => {
    expect(parseHoursText("Пн–Вс 10:00–23:00")).toEqual(all(open("10:00", "23:00")));
    expect(parseHoursText("Пн-Вс 10:00 - 23:00")).toEqual(all(open("10:00", "23:00")));
    expect(parseHoursText("Mon–Sun 12:00–01:00")).toEqual(all(open("12:00", "01:00")));
    expect(parseHoursText("Lun–Dum 08:30–22:00")).toEqual(all(open("08:30", "22:00")));
    expect(parseHoursText("Mo-Su 09:00-22:00")).toEqual(all(open("09:00", "22:00")));
  });

  it("reads groups, single days, lists and days off", () => {
    expect(parseHoursText("Пн–Пт 10:00–22:00, Сб–Вс 11:00–01:00")).toEqual(
      week(...Array(5).fill(open("10:00", "22:00")), open("11:00", "01:00"), open("11:00", "01:00")),
    );
    expect(parseHoursText("Пн выходной, Вт–Вс 12:00–23:00")).toEqual(
      week(closed, ...Array(6).fill(open("12:00", "23:00"))),
    );
    expect(parseHoursText("Mon-Fri 09:00-18:00, Sat, Sun 10:00-16:00")).toEqual(
      week(...Array(5).fill(open("09:00", "18:00")), open("10:00", "16:00"), open("10:00", "16:00")),
    );
    expect(parseHoursText("Luni–Vineri 09:00–18:00; Sâmbătă închis; Duminică liber")).toEqual(
      week(...Array(5).fill(open("09:00", "18:00")), closed, closed),
    );
    expect(parseHoursText("Понедельник: с 10:00 до 22:00")).toEqual(week(open("10:00", "22:00"), ...Array(6).fill(closed)));
  });

  it("treats unmentioned days as closed and a bare range as every day", () => {
    expect(parseHoursText("Пн–Пт 09:00–18:00")).toEqual(week(...Array(5).fill(open("09:00", "18:00")), closed, closed));
    expect(parseHoursText("10:00–22:00")).toEqual(all(open("10:00", "22:00")));
  });

  it("reads round-the-clock lines", () => {
    expect(parseHoursText("круглосуточно")).toEqual(all({ closed: false, open: 0, close: 0 }));
    expect(parseHoursText("Пн–Вс 00:00–24:00")).toEqual(all({ closed: false, open: 0, close: 0 }));
    expect(parseHoursText("Пт–Сб круглосуточно")).toEqual(
      week(closed, closed, closed, closed, { closed: false, open: 0, close: 0 }, { closed: false, open: 0, close: 0 }, closed),
    );
  });

  it("wraps a day range over Sunday", () => {
    expect(parseHoursText("Пт–Пн 18:00–02:00")).toEqual(
      week(open("18:00", "02:00"), closed, closed, closed, open("18:00", "02:00"), open("18:00", "02:00"), open("18:00", "02:00")),
    );
  });

  it("gives up on lines the editor cannot represent", () => {
    expect(parseHoursText("")).toBeNull();
    expect(parseHoursText(null)).toBeNull();
    expect(parseHoursText("ежедневно")).toBeNull();
    expect(parseHoursText("по договорённости")).toBeNull();
    expect(parseHoursText("Пн–Пт 10:00–15:00, 17:00–22:00")).toBeNull();
    expect(parseHoursText("Пн–Пт 10:00–22:00, Пт 12:00–23:00")).toBeNull();
    expect(parseHoursText("Пн–Пт")).toBeNull();
    expect(parseHoursText("выходной")).toBeNull();
    expect(parseHoursText("Пн–Вс 10:00–25:00")).toBeNull();
  });
});

describe("formatHoursText", () => {
  it("writes the canonical line and reads it back", () => {
    const samples: WeekHours[] = [
      all(open("10:00", "23:00")),
      week(...Array(5).fill(open("10:00", "22:00")), open("11:00", "01:00"), open("11:00", "01:00")),
      week(closed, ...Array(6).fill(open("12:00", "23:00"))),
      week(open("09:00", "18:00"), closed, open("09:00", "18:00"), closed, open("09:00", "18:00"), closed, closed),
      all({ closed: false, open: 0, close: 0 }),
    ];
    for (const sample of samples) expect(parseHoursText(formatHoursText(sample))).toEqual(sample);
    expect(formatHoursText(samples[0])).toBe("Пн–Вс 10:00–23:00");
    expect(formatHoursText(samples[1])).toBe("Пн–Пт 10:00–22:00, Сб–Вс 11:00–01:00");
    expect(formatHoursText(samples[2])).toBe("Пн выходной, Вт–Вс 12:00–23:00");
    expect(formatHoursText(samples[4])).toBe("Пн–Вс 00:00–24:00");
  });

  it("is empty when every day is closed", () => {
    expect(formatHoursText(all(closed))).toBe("");
  });

  it("normalises any equal open and close to round the clock", () => {
    expect(formatHoursText(all(open("10:00", "10:00")))).toBe("Пн–Вс 00:00–24:00");
  });

  it("keeps the line readable for the API and the booking widget", () => {
    const line = formatHoursText(week(closed, ...Array(6).fill(open("12:00", "01:00"))));
    expect(bookingRange(line)).toBe("12:00–01:00");
    expect(parseOpeningHours(line)).toEqual({ openMin: 720, closeMin: 25 * 60 });
    expect(parseOpeningHours(formatHoursText(all({ closed: false, open: 0, close: 0 })))).toEqual({ openMin: 0, closeMin: 1440 });
  });
});

describe("describeHours", () => {
  it("summarises in the viewer's language", () => {
    expect(describeHours(all(open("10:00", "22:00")), RU)).toBe("Ежедневно 10:00–22:00");
    expect(describeHours(all({ closed: false, open: 0, close: 0 }), EN)).toBe("Daily 24 hours");
    expect(describeHours(week(closed, ...Array(6).fill(open("12:00", "23:00"))), EN)).toBe("Mon closed · Tue–Sun 12:00–23:00");
  });
});

describe("day helpers", () => {
  it("knows past-midnight and round-the-clock days", () => {
    expect(closesNextDay(open("18:00", "02:00"))).toBe(true);
    expect(closesNextDay(open("18:00", "00:00"))).toBe(false);
    expect(closesNextDay(open("10:00", "22:00"))).toBe(false);
    expect(isRoundTheClock({ closed: false, open: 0, close: 0 })).toBe(true);
    expect(isRoundTheClock(closed)).toBe(false);
  });

  it("tells whether the week varies", () => {
    expect(hoursVaryByDay(defaultWeek())).toBe(false);
    expect(hoursVaryByDay(week(closed, ...Array(6).fill(open("10:00", "22:00"))))).toBe(true);
  });

  it("finds the range the booking uses", () => {
    expect(bookingRange("Пн выходной, Вт–Вс 9:00–23:00")).toBe("09:00–23:00");
    expect(bookingRange("по договорённости")).toBeNull();
  });
});

/* —— Guest side: the line the profile editor writes, read for every weekday —— */

const hm = (from: string, to: string) => {
  const openMin = parseClock(from)!;
  const close = parseClock(to)!;
  return { openMin, closeMin: close > openMin ? close : close + 24 * 60 };
};
// 2026-11-30 is a Monday; local dates, like the booking window.
const dateOf = (weekday: number) => new Date(2026, 10, 30 + weekday, 12, 0);

describe("weekdayIndex", () => {
  it("counts from Monday", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => weekdayIndex(dateOf(d)))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayIndex(new Date(2026, 10, 29))).toBe(6);
  });
});

describe("hoursOnWeekday / venueHoursOn", () => {
  it("reads every weekday of the editor's line: day off, different hours, past midnight", () => {
    const line = formatHoursText(
      week(closed, open("10:00", "23:00"), open("10:00", "23:00"), open("10:00", "23:00"), open("10:00", "01:00"), open("12:00", "02:00"), open("12:00", "20:00")),
    );
    expect(line).toBe("Пн выходной, Вт–Чт 10:00–23:00, Пт 10:00–01:00, Сб 12:00–02:00, Вс 12:00–20:00");
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => hoursOnWeekday(line, d))).toEqual([
      null,
      hm("10:00", "23:00"),
      hm("10:00", "23:00"),
      hm("10:00", "23:00"),
      { openMin: 600, closeMin: 25 * 60 },
      { openMin: 720, closeMin: 26 * 60 },
      hm("12:00", "20:00"),
    ]);
    const venue = { id: "venue-new", hours_text: line };
    expect(venueHoursOn(venue, dateOf(0))).toBeNull();
    expect(venueHoursOn(venue, dateOf(4))).toEqual({ openMin: 600, closeMin: 1500 });
  });

  it("reads round the clock and closing at midnight", () => {
    const always = formatHoursText(Array.from({ length: 7 }, () => ({ closed: false, open: 0, close: 0 })));
    expect(hoursOnWeekday(always, 3)).toEqual({ openMin: 0, closeMin: 24 * 60 });
    expect(hoursOnWeekday("Пн–Вс 12:00–00:00", 2)).toEqual({ openMin: 720, closeMin: 24 * 60 });
  });

  it("reads lines typed in RU, EN and RO the same way", () => {
    for (const line of [
      "Пн–Пт 09:00–18:00, Сб 10:00–16:00, Вс выходной",
      "Mon-Fri 09:00-18:00, Sat 10:00-16:00, Sun closed",
      "Luni–Vineri 09:00–18:00; Sâmbătă 10:00–16:00; Duminică închis",
    ]) {
      expect([0, 4, 5, 6].map((d) => hoursOnWeekday(line, d))).toEqual([hm("09:00", "18:00"), hm("09:00", "18:00"), hm("10:00", "16:00"), null]);
    }
  });

  it("falls back to the first range every day when the line is not day by day", () => {
    expect(hoursOnWeekday("Пн–Пт 10:00–15:00, 17:00–22:00", 6)).toEqual(hm("10:00", "15:00"));
    expect(hoursOnWeekday("по договорённости", 0)).toEqual({ openMin: 600, closeMin: 1380 });
  });

  it("uses the demo hours when the venue publishes none", () => {
    expect(venueHoursOn({ id: "venue-8" }, dateOf(1))).toEqual({ openMin: 720, closeMin: 25 * 60 });
    expect(venueHoursOn({ id: "venue-new", hours_text: "" }, dateOf(1))).toEqual({ openMin: 600, closeMin: 1380 });
  });

  it("keeps the typical day equal to what the API's /availability reads", () => {
    const line = "Пн выходной, Вт–Вс 12:00–23:00";
    expect(venueOpeningHours({ id: "venue-new", hours_text: line })).toEqual(parseOpeningHours(line));
    expect(venueOpeningHours({ id: "venue-new", hours_text: line })).toEqual(hm("12:00", "23:00"));
  });
});

describe("venueHoursLabel", () => {
  it("shows the venue's own hours in the guest's language", () => {
    const venue = { id: "venue-new", hours_text: "Пн выходной, Вт–Вс 12:00–01:00" };
    expect(venueHoursLabel(venue, "ru")).toBe("Пн выходной · Вт–Вс 12:00–01:00");
    expect(venueHoursLabel(venue, "en")).toBe("Mon closed · Tue–Sun 12:00–01:00");
    expect(venueHoursLabel(venue, "ro")).toBe("Lun închis · Mar–Dum 12:00–01:00");
    expect(venueHoursLabel({ id: "venue-new", hours_text: "Пн–Вс 10:00–22:00" }, "en")).toBe("Daily 10:00–22:00");
  });

  it("keeps an unreadable line as written and falls back to the demo hours", () => {
    expect(venueHoursLabel({ id: "venue-new", hours_text: "по договорённости" }, "en")).toBe("по договорённости");
    expect(venueHoursLabel({ id: "venue-1" }, "ro")).toBe("Lun–Dum 10:00–22:00");
  });
});
