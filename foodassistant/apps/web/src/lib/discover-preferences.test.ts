import { describe, expect, it } from "vitest";
import {
  emptyPreferences,
  encodePreferences,
  decodePreferences,
  type DiscoverPreferences,
} from "./discover-preferences";

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
