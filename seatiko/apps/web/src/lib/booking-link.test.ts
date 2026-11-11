import { describe, expect, it } from "vitest";
import { parseBookingParams, stripBookingParams, venueBookingHref } from "./booking-link";

describe("venueBookingHref", () => {
  it("opens quick booking by default", () => {
    expect(venueBookingHref("venue-8")).toBe("/venues/venue-8?book=1");
  });

  it("carries time, guests and duration", () => {
    const href = venueBookingHref("venue-8", {
      time: new Date("2026-11-11T17:30:00Z"),
      guests: 4,
      durationMin: 120,
    });
    expect(href).toBe("/venues/venue-8?book=1&time=2026-11-11T17%3A30%3A00.000Z&guests=4&duration=120");
  });

  it("links to the celebration dialog and skips invalid time", () => {
    expect(venueBookingHref("v 1", { intent: "event", time: "nope" })).toBe("/venues/v%201?book=event");
  });
});

describe("parseBookingParams", () => {
  it("round-trips a link", () => {
    const href = venueBookingHref("venue-8", { time: "2026-11-11T17:30:00Z", guests: 3, durationMin: 90 });
    const params = parseBookingParams(new URL(href, "http://localhost").searchParams);
    expect(params).toEqual({ intent: "quick", time: "2026-11-11T17:30:00.000Z", guests: 3, durationMin: 90 });
  });

  it("drops invalid values", () => {
    const params = parseBookingParams(new URLSearchParams("book=x&time=bad&guests=-2&duration=1.5"));
    expect(params).toEqual({ intent: null, time: null, guests: null, durationMin: null });
  });

  it("recognises the celebration intent", () => {
    expect(parseBookingParams(new URLSearchParams("book=event")).intent).toBe("event");
  });
});

describe("stripBookingParams", () => {
  it("removes only booking params", () => {
    expect(stripBookingParams("http://localhost/venues/v?book=1&time=x&guests=2&duration=90&ref=map#plan")).toBe(
      "/venues/v?ref=map#plan",
    );
  });
});
