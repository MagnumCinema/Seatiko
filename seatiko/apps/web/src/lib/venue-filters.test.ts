import { describe, expect, it } from "vitest";
import type { Venue } from "./api";
import {
  TOP_RATED_MIN,
  isVenueFilter,
  matchesVenueFilter,
  matchesVenueQuery,
} from "./venue-filters";

function venue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "v1",
    city_id: "city-balti",
    name: { ru: "Олива", en: "Oliva", ro: "Oliva" },
    description: { ru: "Уютный зал", en: "Cozy hall", ro: "Sală primitoare" },
    cuisine: ["italian", "pizza"],
    rating: 4.7,
    price_level: 2,
    address: { ru: "ул. Независимости 15А", en: "Independentei 15A", ro: "Str. Independenței 15A" },
    lat: 0,
    lng: 0,
    average_check: 280,
    open_now: true,
    free_tables: 0,
    image_url: "",
    ...overrides,
  };
}

describe("venue filters", () => {
  it("validates filter ids", () => {
    expect(isVenueFilter("wine")).toBe(true);
    expect(isVenueFilter("sushi")).toBe(false);
    expect(isVenueFilter(null)).toBe(false);
  });

  it("applies one shared top-rated threshold", () => {
    expect(matchesVenueFilter(venue({ rating: TOP_RATED_MIN }), "top_rated")).toBe(true);
    expect(matchesVenueFilter(venue({ rating: TOP_RATED_MIN - 0.1 }), "top_rated")).toBe(false);
  });

  it("matches cuisine groups and availability", () => {
    expect(matchesVenueFilter(venue(), "pizza")).toBe(true);
    expect(matchesVenueFilter(venue(), "wine")).toBe(false);
    expect(matchesVenueFilter(venue({ cuisine: ["wine"] }), "wine")).toBe(true);
    expect(matchesVenueFilter(venue({ free_tables: 0 }), "available")).toBe(false);
    expect(matchesVenueFilter(venue({ free_tables: 2 }), "available")).toBe(true);
  });
});

describe("venue search", () => {
  it("finds cuisines by localized labels in any language", () => {
    expect(matchesVenueQuery(venue(), "пицца")).toBe(true);
    expect(matchesVenueQuery(venue(), "итальянская")).toBe(true);
    expect(matchesVenueQuery(venue(), "Italiană")).toBe(true);
    expect(matchesVenueQuery(venue(), "pizza")).toBe(true);
    expect(matchesVenueQuery(venue(), "суши")).toBe(false);
  });

  it("searches names, descriptions and addresses in all locales", () => {
    expect(matchesVenueQuery(venue(), "олива")).toBe(true);
    expect(matchesVenueQuery(venue(), "cozy")).toBe(true);
    expect(matchesVenueQuery(venue(), "независимости")).toBe(true);
    expect(matchesVenueQuery(venue(), "   ")).toBe(true);
  });
});
