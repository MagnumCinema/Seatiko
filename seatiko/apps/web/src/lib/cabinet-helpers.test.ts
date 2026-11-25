import { describe, expect, it } from "vitest";
import {
  filterReservations,
  photoProblem,
  pluralize,
  validateVenueContacts,
} from "./cabinet-helpers";

const ruRecords = { one: "запись", few: "записи", many: "записей", other: "записи" };
const enRecords = { one: "record", few: "records", many: "records", other: "records" };

describe("pluralize", () => {
  it("uses Russian plural forms", () => {
    expect(pluralize(1, ruRecords, "ru")).toBe("запись");
    expect(pluralize(3, ruRecords, "ru")).toBe("записи");
    expect(pluralize(5, ruRecords, "ru")).toBe("записей");
    expect(pluralize(21, ruRecords, "ru")).toBe("запись");
  });
  it("uses English plural forms", () => {
    expect(pluralize(1, enRecords, "en")).toBe("record");
    expect(pluralize(0, enRecords, "en")).toBe("records");
  });
});

describe("validateVenueContacts", () => {
  it("accepts empty and well-formed values", () => {
    expect(validateVenueContacts({ email: "", website: "", phone: "" })).toEqual({});
    expect(
      validateVenueContacts({ email: "hi@oliva.md", website: "https://oliva.md", phone: "+373 69 987 654" }),
    ).toEqual({});
  });
  it("flags malformed values", () => {
    expect(validateVenueContacts({ email: "oliva", website: "oliva.md", phone: "12" })).toEqual({
      email: "invalid",
      website: "invalid",
      phone: "invalid",
    });
  });
});

describe("photoProblem", () => {
  it("checks type and size", () => {
    expect(photoProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(photoProblem({ type: "image/gif", size: 1000 })).toBe("type");
    expect(photoProblem({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("size");
  });
});

describe("filterReservations", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const bookings = [
    { id: "late", reserved_for: "2026-11-28T18:00:00Z", status: "CONFIRMED" },
    { id: "soon", reserved_for: "2026-11-26T19:00:00Z", status: "CONFIRMED" },
    { id: "past", reserved_for: "2026-11-20T19:00:00Z", status: "CHECKED_IN" },
    { id: "cancelled", reserved_for: "2026-11-27T19:00:00Z", status: "CANCELLED" },
  ];
  it("orders upcoming soonest first", () => {
    expect(filterReservations(bookings, "upcoming", now).map((b) => b.id)).toEqual(["soon", "late"]);
  });
  it("puts cancelled and past into history, newest first", () => {
    expect(filterReservations(bookings, "history", now).map((b) => b.id)).toEqual(["cancelled", "past"]);
  });
});
