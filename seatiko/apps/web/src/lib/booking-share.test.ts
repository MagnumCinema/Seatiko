import { describe, expect, it } from "vitest";
import {
  BookingShareInput,
  buildIcs,
  googleCalendarUrl,
  icsFileName,
  mapsRouteUrl,
  shareText,
} from "./booking-share";

describe("buildIcs", () => {
  const baseInput: BookingShareInput = {
    reservationId: "res-123",
    venueName: "La Terrazza",
    address: "Str. Independenței 10",
    lat: 47.7612,
    lng: 27.9281,
    start: new Date("2026-11-11T16:30:00Z"),
    durationMin: 90,
    tables: [3],
    guests: 2,
    notes: "Window seat preferred",
    url: "https://seatiko.app/r/res-123",
  };

  it("contains BEGIN/END VCALENDAR and VEVENT with required RFC 5545 headers", () => {
    const ics = buildIcs(baseInput, new Date("2026-11-11T12:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("PRODID:-//Seatiko//Booking//EN\r\n");
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("CALSCALE:GREGORIAN\r\n");
    expect(ics).toContain("METHOD:PUBLISH\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:res-123@seatiko\r\n");
    expect(ics).toContain("SUMMARY:La Terrazza · table №3\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("formats correct UTC DTSTART/DTEND for a fixed date and duration", () => {
    const start = new Date("2026-11-11T16:30:00Z");
    const ics = buildIcs({ ...baseInput, start, durationMin: 90 }, new Date("2026-11-11T12:00:00Z"));
    expect(ics).toContain("DTSTART:20261111T163000Z\r\n");
    expect(ics).toContain("DTEND:20261111T180000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261111T120000Z\r\n");
  });

  it("uses CRLF line endings throughout", () => {
    const ics = buildIcs(baseInput);
    expect(ics).toContain("\r\n");
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("escapes special characters per RFC 5545 (a,b;c\\d\\nx)", () => {
    const ics = buildIcs({
      ...baseInput,
      notes: "a,b;c\\d\nx",
    });
    expect(ics).toContain("a\\,b\\;c\\\\d\\nx");
  });

  it("folds a very long Cyrillic notes line so every physical line is <= 75 bytes and unfolding restores the text", () => {
    const cyrillicNotes =
      "Очень длинная заметка для бронирования столика в ресторане на молдавском или русском языке: пожалуйста, подготовьте детский стульчик и столик у окна с красивым панорамным видом на центральный сквер города.";
    const ics = buildIcs({
      ...baseInput,
      notes: cyrillicNotes,
    });

    const physicalLines = ics.split("\r\n");
    expect(physicalLines.length).toBeGreaterThan(10);

    const encoder = new TextEncoder();
    for (const line of physicalLines) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }

    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(cyrillicNotes.replace(/,/g, "\\,"));
  });

  it("omits GEO when lat/lng are missing and includes GEO when both are finite", () => {
    const withoutGeo = buildIcs({
      ...baseInput,
      lat: undefined,
      lng: undefined,
    });
    expect(withoutGeo).not.toContain("GEO:");

    const withGeo = buildIcs(baseInput);
    expect(withGeo).toContain("GEO:47.7612;27.9281\r\n");
  });

  it("omits LOCATION and URL when absent", () => {
    const minimal = buildIcs({
      ...baseInput,
      address: undefined,
      url: undefined,
    });
    expect(minimal).not.toContain("LOCATION:");
    expect(minimal).not.toContain("URL:");
  });

  it("includes VALARM with 30-minute display trigger and summary description", () => {
    const ics = buildIcs(baseInput);
    expect(ics).toContain("BEGIN:VALARM\r\n");
    expect(ics).toContain("TRIGGER:-PT30M\r\n");
    expect(ics).toContain("ACTION:DISPLAY\r\n");
    expect(ics).toContain("DESCRIPTION:La Terrazza · table №3\r\n");
    expect(ics).toContain("END:VALARM\r\n");
  });
});

describe("icsFileName", () => {
  it("formats file name with local start time YYYYMMDD-HHMM", () => {
    const date = new Date(2026, 10, 11, 18, 30);
    const name = icsFileName({
      reservationId: "res-001",
      venueName: "Bella Italia",
      start: date,
      durationMin: 60,
      tables: [1],
      guests: 2,
    });
    expect(name).toBe("seatiko-booking-20261111-1830.ics");
  });
});

describe("googleCalendarUrl", () => {
  const input: BookingShareInput = {
    reservationId: "res-456",
    venueName: "Bella Italia",
    address: "Bd. Eminescu 5",
    start: new Date("2026-11-11T16:30:00Z"),
    durationMin: 90,
    tables: [1, 2],
    guests: 4,
    notes: "Birthday celebration",
    url: "https://seatiko.app/r/res-456",
  };

  it("builds a Google Calendar TEMPLATE URL containing the dates param", () => {
    const urlString = googleCalendarUrl(input);
    const url = new URL(urlString);

    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261111T163000Z/20261111T180000Z");
    expect(url.searchParams.get("text")).toBe("Bella Italia · table №1 + 2");
    expect(url.searchParams.get("location")).toBe("Bd. Eminescu 5");
    expect(url.searchParams.get("details")).toContain("Guests: 4");
    expect(url.searchParams.get("details")).toContain("Birthday celebration");
    expect(url.searchParams.get("details")).toContain("https://seatiko.app/r/res-456");
  });
});

describe("mapsRouteUrl", () => {
  it("uses coordinates when both lat and lng are finite and not both 0", () => {
    const url = mapsRouteUrl({
      lat: 47.7612,
      lng: 27.9281,
      address: "Bd. Eminescu 5",
      venueName: "Bella Italia",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("api")).toBe("1");
    expect(parsed.searchParams.get("destination")).toBe("47.7612,27.9281");
  });

  it("treats 0,0 coordinates as missing and falls back to address", () => {
    const url = mapsRouteUrl({
      lat: 0,
      lng: 0,
      address: "Bd. Eminescu 5",
      venueName: "Bella Italia",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("api")).toBe("1");
    expect(parsed.searchParams.get("destination")).toBe("Bd. Eminescu 5");
  });

  it("falls back to address when coordinates are missing", () => {
    const url = mapsRouteUrl({
      address: "Bd. Eminescu 5",
      venueName: "Bella Italia",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("destination")).toBe("Bd. Eminescu 5");
  });

  it("falls back to venueName when coordinates and address are missing", () => {
    const url = mapsRouteUrl({
      venueName: "Bella Italia",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("destination")).toBe("Bella Italia");
  });
});

describe("shareText", () => {
  const input: BookingShareInput = {
    reservationId: "res-789",
    venueName: "Trattoria",
    address: "Str. Stefan cel Mare 1",
    start: new Date("2026-11-11T18:00:00Z"),
    durationMin: 60,
    tables: [5],
    guests: 3,
    url: "https://seatiko.app/r/res-789",
  };

  const labels = { table: "Стол", guests: "Гостей" };
  const formatWhen = (d: Date) => `11 нояб., 20:00 (${d.toISOString()})`;

  it("formats multi-line plain text lines joined with \\n", () => {
    const result = shareText(input, labels, formatWhen);
    const lines = result.split("\n");

    expect(lines).toEqual([
      "Trattoria",
      "11 нояб., 20:00 (2026-11-11T18:00:00.000Z)",
      "Стол №5 · Гостей: 3",
      "Str. Stefan cel Mare 1",
      "https://seatiko.app/r/res-789",
    ]);
  });

  it("omits address and url lines when they are not provided", () => {
    const minimal: BookingShareInput = {
      reservationId: "res-789",
      venueName: "Trattoria",
      start: new Date("2026-11-11T18:00:00Z"),
      durationMin: 60,
      tables: [2, 3],
      guests: 4,
    };
    const result = shareText(minimal, labels, formatWhen);
    const lines = result.split("\n");

    expect(lines).toEqual([
      "Trattoria",
      "11 нояб., 20:00 (2026-11-11T18:00:00.000Z)",
      "Стол №2 + 3 · Гостей: 4",
    ]);
  });
});
