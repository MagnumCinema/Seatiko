import { describe, expect, it } from "vitest";
import {
  emptyPreferences,
  encodePreferences,
  decodePreferences,
  filterAndRankPlaces,
  normalizeBudgetRange,
  priceLevelsForMdlRange,
  budgetPresetRange,
  matchBudgetPreset,
  BUDGET_MDL_MIN,
  BUDGET_MDL_MAX,
  BUDGET_MDL_STEP,
  CUISINE_PRIMARY,
  CUISINE_MORE,
  RESTAURANT_TYPE_PRIMARY,
  RESTAURANT_TYPE_MORE,
  OCCASION_PRIMARY,
  OCCASION_MORE,
  PRACTICAL_PRIMARY,
  PRACTICAL_MORE,
  CUISINE_IDS,
  RESTAURANT_TYPE_IDS,
  OCCASION_IDS,
  PRACTICAL_IDS,
  type DiscoverPreferences,
} from "./discover-preferences";
import type { MapPlace } from "@/lib/api";

describe("MDL budget helpers", () => {
  it("exposes 50–1000 step 50 bounds", () => {
    expect(BUDGET_MDL_MIN).toBe(50);
    expect(BUDGET_MDL_MAX).toBe(1000);
    expect(BUDGET_MDL_STEP).toBe(50);
  });

  it("normalizeBudgetRange clamps, orders, and snaps to step", () => {
    expect(normalizeBudgetRange({ min: 40, max: 1075 })).toEqual({
      min: 50,
      max: 1000,
    });
    expect(normalizeBudgetRange({ min: 480, max: 220 })).toEqual({
      min: 200,
      max: 500,
    });
    expect(normalizeBudgetRange({ min: 175, max: 325 })).toEqual({
      min: 150,
      max: 350,
    });
  });

  it("priceLevelsForMdlRange soft-maps overlapping bands", () => {
    expect(priceLevelsForMdlRange(null)).toEqual([]);
    expect(priceLevelsForMdlRange({ min: 50, max: 200 })).toEqual([1]);
    expect(priceLevelsForMdlRange({ min: 150, max: 400 })).toEqual([1, 2]);
    expect(priceLevelsForMdlRange({ min: 500, max: 1000 })).toEqual([2, 3]);
    expect(priceLevelsForMdlRange({ min: 700, max: 1000 })).toEqual([3]);
  });

  it("budget presets are max-only with default floor", () => {
    expect(budgetPresetRange("under200")).toEqual({ min: 50, max: 200 });
    expect(budgetPresetRange("200_400")).toEqual({ min: 50, max: 400 });
    expect(budgetPresetRange("any")).toBeNull();
    expect(matchBudgetPreset({ min: 50, max: 400 })).toBe("200_400");
    expect(matchBudgetPreset({ min: 150, max: 400 })).toBeNull();
  });
});

describe("primary chip counts", () => {
  it("shows denser defaults before Show more", () => {
    expect(CUISINE_PRIMARY).toHaveLength(8);
    expect(RESTAURANT_TYPE_PRIMARY).toHaveLength(6);
    expect(OCCASION_PRIMARY).toHaveLength(6);
    expect(PRACTICAL_PRIMARY).toHaveLength(6);
  });

  it("keeps PRIMARY+MORE disjoint and covering all ids", () => {
    expect([...CUISINE_PRIMARY, ...CUISINE_MORE].sort()).toEqual(
      [...CUISINE_IDS].sort(),
    );
    expect([...RESTAURANT_TYPE_PRIMARY, ...RESTAURANT_TYPE_MORE].sort()).toEqual(
      [...RESTAURANT_TYPE_IDS].sort(),
    );
    expect([...OCCASION_PRIMARY, ...OCCASION_MORE].sort()).toEqual(
      [...OCCASION_IDS].sort(),
    );
    expect([...PRACTICAL_PRIMARY, ...PRACTICAL_MORE].sort()).toEqual(
      [...PRACTICAL_IDS].sort(),
    );
  });
});

describe("encodePreferences / decodePreferences", () => {
  it("round-trips full prefs with MDL budget", () => {
    const prefs: DiscoverPreferences = {
      cuisine: ["italian", "asian"],
      restaurantType: ["cafe"],
      budget: { min: 200, max: 400 },
      budgetCurrency: "MDL",
      occasion: ["date_night"],
      practical: ["open_now", "partners"],
    };
    const qs = encodePreferences(prefs);
    expect(qs).toContain("budget=200-400");
    expect(qs).not.toContain("currency=");
    expect(decodePreferences(qs)).toEqual(prefs);
  });

  it("round-trips non-MDL display currency", () => {
    const prefs: DiscoverPreferences = {
      ...emptyPreferences(),
      budget: { min: 200, max: 400 },
      budgetCurrency: "EUR",
    };
    const qs = encodePreferences(prefs);
    expect(qs).toContain("currency=EUR");
    expect(decodePreferences(qs).budgetCurrency).toBe("EUR");
  });

  it("returns empty prefs for blank / garbage input", () => {
    expect(decodePreferences("")).toEqual(emptyPreferences());
    expect(decodePreferences("foo=bar&cuisine=not-a-real-id")).toEqual(
      emptyPreferences(),
    );
  });

  it("parses budget=min-max and ignores legacy level lists", () => {
    expect(decodePreferences("budget=150-450").budget).toEqual({
      min: 150,
      max: 450,
    });
    const mixed = decodePreferences("cuisine=italian,nope&budget=2,9");
    expect(mixed.cuisine).toEqual(["italian"]);
    expect(mixed.budget).toBeNull();
    expect(decodePreferences("budget=abc").budget).toBeNull();
  });
});

function place(partial: Partial<MapPlace> & Pick<MapPlace, "id">): MapPlace {
  return {
    name: { ru: partial.id, en: partial.id, ro: partial.id },
    lat: 47.76,
    lng: 27.92,
    address: { ru: "", en: "", ro: "" },
    in_database: true,
    bookable: false,
    ...partial,
  };
}

describe("filterAndRankPlaces", () => {
  const italianPartner = place({
    id: "a",
    cuisine: ["Italian"],
    price_level: 2,
    in_database: true,
    open_now: true,
    free_tables: 2,
    rating: 4.8,
  });
  const asianCheap = place({
    id: "b",
    cuisine: ["Asian"],
    price_level: 1,
    in_database: false,
    open_now: true,
    rating: 4.2,
  });
  const moldovanClosed = place({
    id: "c",
    cuisine: ["Moldovan"],
    price_level: 2,
    in_database: true,
    open_now: false,
    free_tables: 0,
    rating: 4.9,
  });

  it("returns default in_database/rating order when prefs empty", () => {
    const ranked = filterAndRankPlaces(
      [asianCheap, italianPartner, moldovanClosed],
      emptyPreferences(),
    );
    // Partners first, then rating desc: c (4.9) before a (4.8), then non-partner b
    expect(ranked.map((r) => r.place.id)).toEqual(["c", "a", "b"]);
  });

  it("hard-filters cuisine OR and partners", () => {
    const prefs: DiscoverPreferences = {
      ...emptyPreferences(),
      cuisine: ["italian", "asian"],
      practical: ["partners"],
    };
    const ranked = filterAndRankPlaces(
      [italianPartner, asianCheap, moldovanClosed],
      prefs,
    );
    expect(ranked.map((r) => r.place.id)).toEqual(["a"]);
  });

  it("hard-filters open_now and ranks cuisine match higher", () => {
    const prefs: DiscoverPreferences = {
      ...emptyPreferences(),
      cuisine: ["italian"],
      practical: ["open_now"],
    };
    const ranked = filterAndRankPlaces(
      [italianPartner, asianCheap, moldovanClosed],
      prefs,
    );
    expect(ranked.map((r) => r.place.id)).toEqual(["a"]);
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it("budget hard-filter keeps matching price_level", () => {
    const prefs: DiscoverPreferences = {
      ...emptyPreferences(),
      budget: { min: 50, max: 200 },
    };
    const ranked = filterAndRankPlaces(
      [italianPartner, asianCheap],
      prefs,
    );
    expect(ranked.map((r) => r.place.id)).toEqual(["b"]);
  });

  it("does not hard-exclude places missing price_level", () => {
    const noPrice = place({
      id: "d",
      cuisine: ["Italian"],
      in_database: true,
      rating: 4.0,
    });
    const prefs: DiscoverPreferences = {
      ...emptyPreferences(),
      budget: { min: 200, max: 400 },
    };
    const ranked = filterAndRankPlaces([italianPartner, noPrice], prefs);
    expect(ranked.map((r) => r.place.id)).toContain("d");
    expect(ranked.map((r) => r.place.id)).toContain("a");
    const scoredKnown = ranked.find((r) => r.place.id === "a")!;
    const scoredUnknown = ranked.find((r) => r.place.id === "d")!;
    expect(scoredKnown.score).toBeGreaterThan(scoredUnknown.score);
  });

  it("treats restaurant type as soft (scoring only)", () => {
    const fineDining = place({
      id: "e",
      name: { ru: "Fine Dining", en: "Fine Dining", ro: "Fine Dining" },
      cuisine: ["Italian"],
      price_level: 3,
      in_database: true,
      rating: 4.5,
    });
    const prefs: DiscoverPreferences = {
      ...emptyPreferences(),
      restaurantType: ["fast_food"],
    };
    const ranked = filterAndRankPlaces([fineDining, italianPartner], prefs);
    expect(ranked.map((r) => r.place.id)).toEqual(
      expect.arrayContaining(["e", "a"]),
    );
    expect(ranked).toHaveLength(2);
  });
});
