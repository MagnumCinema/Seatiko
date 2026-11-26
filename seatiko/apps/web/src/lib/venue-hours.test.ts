import { describe, expect, it } from "vitest";
import { venueOpeningHours } from "./venue-hours";

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
