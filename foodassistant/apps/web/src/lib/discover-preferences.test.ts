import { describe, expect, it } from "vitest";
import {
  emptyPreferences,
  encodePreferences,
  decodePreferences,
  filterAndRankPlaces,
  type DiscoverPreferences,
} from "./discover-preferences";
import type { MapPlace } from "@/lib/api";

describe("encodePreferences / decodePreferences", () => {
  it("round-trips full prefs", () => {
    const prefs: DiscoverPreferences = {
      cuisine: ["italian", "asian"],
      restaurantType: ["cafe"],
      budget: [2],
      occasion: ["date_night"],
      practical: ["open_now", "partners"],
    };
    const qs = encodePreferences(prefs);
    expect(qs).toContain("cuisine=italian%2Casian");
    expect(decodePreferences(qs)).toEqual(prefs);
  });

  it("returns empty prefs for blank / garbage input", () => {
    expect(decodePreferences("")).toEqual(emptyPreferences());
    expect(decodePreferences("foo=bar&cuisine=not-a-real-id")).toEqual(
      emptyPreferences(),
    );
  });

  it("ignores unknown keys and keeps valid cuisine ids", () => {
    const prefs = decodePreferences("cuisine=italian,nope&budget=2,9");
    expect(prefs.cuisine).toEqual(["italian"]);
    expect(prefs.budget).toEqual([2]);
  });
});

function place(partial: Partial<MapPlace> & Pick<MapPlace, "id">): MapPlace {
  return {
    name: { ru: partial.id, en: partial.id, ro: partial.id },
    lat: 47.76,
    lng: 27.92,
    address: { ru: "", en: "", ro: "" },
    in_database: true,
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
      budget: [1],
    };
    const ranked = filterAndRankPlaces(
      [italianPartner, asianCheap],
      prefs,
    );
    expect(ranked.map((r) => r.place.id)).toEqual(["b"]);
  });
});
