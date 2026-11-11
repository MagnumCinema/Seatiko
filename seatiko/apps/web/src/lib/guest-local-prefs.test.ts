// @vitest-environment happy-dom

import { describe, expect, it, beforeEach } from "vitest";
import {
  loadGuestLocalPrefs,
  saveGuestLocalPrefs,
  addFavoriteVenue,
  removeFavoriteVenue,
  emptyGuestLocalPrefs,
  type GuestLocalPrefs,
} from "./guest-local-prefs";

const USER = "user-1";

describe("guest-local-prefs", () => {
  beforeEach(() => localStorage.clear());

  it("returns empty prefs when missing", () => {
    expect(loadGuestLocalPrefs(USER)).toEqual(emptyGuestLocalPrefs());
  });

  it("round-trips allergies", () => {
    const prefs: GuestLocalPrefs = {
      allergies: "gluten, lactose",
      favorites: [],
    };
    saveGuestLocalPrefs(USER, prefs);
    expect(loadGuestLocalPrefs(USER).allergies).toBe("gluten, lactose");
  });

  it("scopes by user id", () => {
    saveGuestLocalPrefs("a", { allergies: "nuts", favorites: [] });
    expect(loadGuestLocalPrefs("b").allergies).toBe("");
  });

  it("adds and removes favorites without duplicates", () => {
    let prefs = emptyGuestLocalPrefs();
    prefs = addFavoriteVenue(prefs, {
      venueId: "v1",
      name: "Cafe One",
    });
    prefs = addFavoriteVenue(prefs, {
      venueId: "v1",
      name: "Cafe One",
    });
    expect(prefs.favorites).toHaveLength(1);
    prefs = removeFavoriteVenue(prefs, "v1");
    expect(prefs.favorites).toHaveLength(0);
  });
});
