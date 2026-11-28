import { describe, expect, it } from "vitest";
import {
  isMostlyCyrillic,
  isVenueBookable,
  reviewTimeLabel,
  reviewsForLocale,
  textFitsLocale,
  toggleFavoriteId,
} from "@/lib/venue-page";

describe("isVenueBookable", () => {
  it("is false for a venue with no tables", () => {
    expect(isVenueBookable({}, [])).toBe(false);
  });
  it("is true once the venue has tables", () => {
    expect(isVenueBookable({}, [{ id: "t1" }])).toBe(true);
  });
  it("follows the API flag when it is sent", () => {
    expect(isVenueBookable({ bookable: false }, [{ id: "t1" }])).toBe(false);
    expect(isVenueBookable({ bookable: true }, [{ id: "t1" }])).toBe(true);
    expect(isVenueBookable({ bookable: true }, [])).toBe(false);
  });
});

describe("review language", () => {
  it("detects Cyrillic text", () => {
    expect(isMostlyCyrillic("Лучшие плацинды в Бельцах.")).toBe(true);
    expect(isMostlyCyrillic("Great wine list, Seatiko booking worked.")).toBe(false);
    expect(isMostlyCyrillic("Бронь через Seatiko — отлично")).toBe(true);
    expect(isMostlyCyrillic("5/5 !!")).toBe(false);
  });

  it("shows Russian text only in RU and Latin text only in EN/RO", () => {
    expect(textFitsLocale("Отличный сервис", "ru")).toBe(true);
    expect(textFitsLocale("Отличный сервис", "en")).toBe(false);
    expect(textFitsLocale("Отличный сервис", "ro")).toBe(false);
    expect(textFitsLocale("Servire excelentă", "ro")).toBe(true);
    expect(textFitsLocale("Servire excelentă", "ru")).toBe(false);
    expect(textFitsLocale("   ", "ru")).toBe(false);
  });

  it("filters reviews to the active language", () => {
    const reviews = [
      { text: "Лучшие плацинды", author: "A" },
      { text: "Lovely terrace", author: "B" },
    ];
    expect(reviewsForLocale(reviews, "ru").map((r) => r.author)).toEqual(["A"]);
    expect(reviewsForLocale(reviews, "en").map((r) => r.author)).toEqual(["B"]);
  });
});

describe("reviewTimeLabel", () => {
  const now = new Date("2026-11-28T12:00:00Z");

  it("formats an ISO date in the guest's language", () => {
    const review = { published_at: "2026-11-14T12:00:00Z", relative_time: "2 недели назад" };
    expect(reviewTimeLabel(review, "en", now)).toBe("2 weeks ago");
    expect(reviewTimeLabel(review, "ru", now)).toBe("2 недели назад");
  });

  it("keeps the API relative line only in its own language", () => {
    expect(reviewTimeLabel({ relative_time: "5 дней назад" }, "ru", now)).toBe("5 дней назад");
    expect(reviewTimeLabel({ relative_time: "5 дней назад" }, "ro", now)).toBeNull();
    expect(reviewTimeLabel({}, "en", now)).toBeNull();
  });
});

describe("toggleFavoriteId", () => {
  it("adds a missing venue and removes a saved one", () => {
    expect(toggleFavoriteId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavoriteId(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});
