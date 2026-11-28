import { describe, expect, it } from "vitest";
import type { MapPlace } from "@/lib/api";
import type { Venue } from "@/lib/api";
import {
  MAP_TILE_STYLES,
  applyQuickFilters,
  areaChanged,
  clipBounds,
  closingTime,
  clusterRadius,
  nearestSnap,
  placesInView,
  pluralForm,
  sheetHeights,
  shortPinName,
  terraceFilterAvailable,
  toggleQuickFilter,
  validBounds,
  venueAsMapPlace,
  type QuickFilter,
} from "@/lib/home-map";

function place(overrides: Partial<MapPlace> & { features?: string[] } = {}): MapPlace {
  return {
    id: "p",
    name: { ru: "Oliva", en: "Oliva", ro: "Oliva" },
    address: { ru: "", en: "", ro: "" },
    lat: 47.76,
    lng: 27.93,
    in_database: false,
    bookable: false,
    ...overrides,
  } as MapPlace;
}

const partner = place({ id: "venue-1", venue_id: "venue-1", in_database: true, bookable: true, open_now: true, free_tables: 4 });
const partnerClosed = place({ id: "venue-2", venue_id: "venue-2", in_database: true, bookable: true, open_now: false, features: ["terrace"] });
const partnerNoBooking = place({ id: "venue-3", venue_id: "venue-3", in_database: true, bookable: false, open_now: true, features: ["terrace"] });
const openData = place({ id: "osm-1", open_now: true });
const all = [partner, partnerClosed, partnerNoBooking, openData];

describe("applyQuickFilters", () => {
  const none = new Set<string>();
  it("returns every place without active chips", () => {
    expect(applyQuickFilters(all, new Set(), none)).toEqual(all);
  });
  it("keeps only bookable partners", () => {
    expect(applyQuickFilters(all, new Set<QuickFilter>(["bookable"]), none).map((p) => p.id)).toEqual(["venue-1", "venue-2"]);
  });
  it("keeps places open now (unknown hours are not open)", () => {
    const unknown = place({ id: "osm-2", open_now: null });
    expect(applyQuickFilters([...all, unknown], new Set<QuickFilter>(["openNow"]), none).map((p) => p.id)).toEqual(["venue-1", "venue-3", "osm-1"]);
  });
  it("combines chips with AND (open terrace)", () => {
    expect(applyQuickFilters(all, new Set<QuickFilter>(["openNow", "terrace"]), none).map((p) => p.id)).toEqual(["venue-3"]);
  });
  it("keeps saved venues only", () => {
    expect(applyQuickFilters(all, new Set<QuickFilter>(["saved"]), new Set(["venue-2"])).map((p) => p.id)).toEqual(["venue-2"]);
  });
  it("returns nothing when no place matches", () => {
    expect(applyQuickFilters(all, new Set<QuickFilter>(["saved", "bookable"]), new Set(["venue-3"]))).toEqual([]);
  });
});

describe("toggleQuickFilter", () => {
  it("adds and removes a chip", () => {
    const on = toggleQuickFilter(new Set(), "openNow");
    expect([...on]).toEqual(["openNow"]);
    expect([...toggleQuickFilter(on, "openNow")]).toEqual([]);
  });
  it("'All' clears every chip", () => {
    expect(toggleQuickFilter(new Set<QuickFilter>(["openNow", "saved"]), null).size).toBe(0);
  });
  it("does not mutate the input", () => {
    const active = new Set<QuickFilter>(["saved"]);
    toggleQuickFilter(active, "bookable");
    expect([...active]).toEqual(["saved"]);
  });
});

describe("terraceFilterAvailable", () => {
  it("is false until the API sends terrace features", () => {
    expect(terraceFilterAvailable([partner, openData])).toBe(false);
    expect(terraceFilterAvailable(all)).toBe(true);
  });
});

describe("visible area", () => {
  const bounds = { south: 47.7, west: 27.9, north: 47.8, east: 28 };
  it("lists only places inside the bounds, in order", () => {
    const far = place({ id: "far", lat: 47.9 });
    expect(placesInView([partner, far, openData], bounds).map((p) => p.id)).toEqual(["venue-1", "osm-1"]);
  });
  it("treats missing bounds as everything visible", () => {
    expect(placesInView(all, null)).toBe(all);
  });
  it("validates and clips bounds", () => {
    expect(validBounds(bounds)).toBe(true);
    expect(validBounds({ south: 1, west: 0, north: 0, east: 1 })).toBe(false);
    expect(clipBounds({ south: 47, west: 27, north: 48, east: 28.5 }, bounds)).toEqual(bounds);
  });
  it("offers 'search this area' only after a real move", () => {
    expect(areaChanged(bounds, bounds)).toBe(false);
    expect(areaChanged({ ...bounds, north: 47.805, south: 47.705 }, bounds)).toBe(false);
    expect(areaChanged({ ...bounds, west: 27.95, east: 28.05 }, bounds)).toBe(true);
  });
});

describe("closingTime", () => {
  const at = (iso: string) => new Date(iso);
  // 2026-11-27 is a Friday, 2026-11-28 a Saturday.
  it("shows today's closing time while open", () => {
    expect(closingTime({ id: "x", hours_text: "Пн–Вс 10:00–23:00" }, at("2026-11-27T15:30:00"))).toBe("23:00");
  });
  it("is null before opening and after closing", () => {
    expect(closingTime({ id: "x", hours_text: "Пн–Вс 10:00–23:00" }, at("2026-11-27T08:00:00"))).toBeNull();
    expect(closingTime({ id: "x", hours_text: "Пн–Вс 10:00–23:00" }, at("2026-11-27T23:10:00"))).toBeNull();
  });
  it("is null on a day off", () => {
    expect(closingTime({ id: "x", hours_text: "Пн–Пт 10:00–23:00, Сб–Вс выходной" }, at("2026-11-28T12:00:00"))).toBeNull();
  });
  it("reads a night past midnight from the previous day", () => {
    const venue = { id: "x", hours_text: "Пн–Вс 18:00–02:00" };
    expect(closingTime(venue, at("2026-11-28T01:15:00"))).toBe("02:00");
    expect(closingTime(venue, at("2026-11-27T21:00:00"))).toBe("02:00");
    expect(closingTime(venue, at("2026-11-28T03:00:00"))).toBeNull();
  });
  it("prints midnight closing as 00:00", () => {
    expect(closingTime({ id: "x", hours_text: "Пн–Вс 12:00–00:00" }, at("2026-11-27T20:00:00"))).toBe("00:00");
  });
  it("has no 'until' for round-the-clock venues", () => {
    expect(closingTime({ id: "x", hours_text: "круглосуточно" }, at("2026-11-27T20:00:00"))).toBeNull();
  });
});

describe("pins and clusters", () => {
  it("shortens pin names", () => {
    expect(shortPinName("Porto Mare Seafood & Grill")).toBe("Porto");
    expect(shortPinName("La Plăcinte")).toBe("La Plăcinte");
    expect(shortPinName("Supercalifragilistic")).toBe("Supercalifrag…");
    expect(shortPinName("  ")).toBe("");
  });
  it("sizes clusters by count", () => {
    expect(clusterRadius(3)).toBe(17);
    expect(clusterRadius(14)).toBe(21);
    expect(clusterRadius(40)).toBe(26);
  });
});

describe("phone sheet snaps", () => {
  const heights = sheetHeights(600);
  it("orders peek < half < full inside the canvas", () => {
    expect(heights.peek).toBeLessThan(heights.half);
    expect(heights.half).toBeLessThan(heights.full);
    expect(heights.full).toBeLessThanOrEqual(600);
  });
  it("keeps a usable half on short screens", () => {
    const small = sheetHeights(380);
    expect(small.half).toBeGreaterThan(small.peek);
    expect(small.full).toBeGreaterThan(small.half);
  });
  it("snaps to the nearest height on a slow release", () => {
    expect(nearestSnap(160, heights)).toBe("peek");
    expect(nearestSnap(heights.half + 20, heights)).toBe("half");
    expect(nearestSnap(heights.full - 10, heights)).toBe("full");
  });
  it("moves one step on a flick", () => {
    expect(nearestSnap(heights.peek + 10, heights, 0.9, "peek")).toBe("half");
    expect(nearestSnap(heights.full - 10, heights, -0.9, "full")).toBe("half");
    expect(nearestSnap(heights.full, heights, 0.9, "full")).toBe("full");
    expect(nearestSnap(heights.peek, heights, -0.9, "peek")).toBe("peek");
  });
});

describe("pluralForm", () => {
  const forms = { one: "место", few: "места", many: "мест", other: "места" };
  it("follows Russian plural rules", () => {
    expect(pluralForm(forms, "ru", 1)).toBe("место");
    expect(pluralForm(forms, "ru", 3)).toBe("места");
    expect(pluralForm(forms, "ru", 12)).toBe("мест");
  });
});

describe("venue page location map", () => {
  const venue = {
    id: "venue-12",
    name: { ru: "Порто Маре", en: "Porto Mare", ro: "Porto Mare" },
    address: { ru: "ул. 31 Августа", en: "31 August St", ro: "Str. 31 August" },
    lat: 47.76,
    lng: 27.93,
    rating: 4.9,
    open_now: true,
    free_tables: 9,
    hours_text: "Пн–Вс 12:00–23:30",
    cuisine: ["seafood"],
    price_level: 3,
    average_check: 420,
  } as Venue;

  it("turns the venue into a partner map place with the live free-table count", () => {
    const place = venueAsMapPlace(venue, { bookable: true, freeTables: 2 });
    expect(place).toMatchObject({ id: "venue-12", venue_id: "venue-12", in_database: true, bookable: true, free_tables: 2 });
    expect(place.hours_text).toBe("Пн–Вс 12:00–23:30");
    expect(venueAsMapPlace(venue, { bookable: true }).free_tables).toBe(9);
  });

  it("has no free-table count when the venue has no online booking", () => {
    expect(venueAsMapPlace(venue, { bookable: false, freeTables: 3 })).toMatchObject({ bookable: false, free_tables: undefined });
  });

  it("uses dark tiles in the dark theme", () => {
    expect(MAP_TILE_STYLES.dark).toContain("/styles/dark");
    expect(MAP_TILE_STYLES.light).toContain("/styles/liberty");
  });
});
