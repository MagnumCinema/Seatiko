import { describe, expect, it } from "vitest";
import {
  bookingRange,
  closesNextDay,
  defaultWeek,
  describeHours,
  formatClock,
  formatHoursText,
  hoursVaryByDay,
  isRoundTheClock,
  parseClock,
  parseHoursText,
  type DayHours,
  type WeekHours,
} from "./opening-hours";
import { parseOpeningHours } from "./booking-slots";

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
