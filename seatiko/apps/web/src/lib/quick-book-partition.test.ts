import { describe, expect, it } from "vitest";
import {
  emptyKind,
  partitionQuickBookResults,
  type QuickBookRow,
} from "./quick-book-partition";
import type { VenueAvailability } from "./venue-availability";

function avail(partial: Partial<VenueAvailability>): VenueAvailability {
  return {
    durationMin: 90,
    fits: true,
    exact: null,
    slots: [],
    ...partial,
  };
}

function row(
  id: string,
  availability: VenueAvailability,
  laterToday: VenueAvailability | null = null,
): QuickBookRow {
  return {
    venue: { id } as QuickBookRow["venue"],
    availability,
    laterToday,
    rank: 0,
  };
}

describe("partitionQuickBookResults", () => {
  it("browse mode shows only venues with slots", () => {
    const slot = {
      start: new Date(2026, 10, 12, 19, 0),
      available: true,
      tableId: "t2",
    };
    const withSlots = row("a", avail({ slots: [slot] }));
    const busy = row("b", avail({ slots: [] }));
    const small = row("c", avail({ fits: false, slots: [] }));
    const p = partitionQuickBookResults({
      results: [withSlots, busy, small],
      searching: false,
      queryText: "",
    });
    expect(p.cards.map((r) => r.venue.id)).toEqual(["a"]);
    expect(p.unavailable.map((r) => r.venue.id)).toEqual(["b"]);
    expect(p.tooSmall.map((r) => r.venue.id)).toEqual(["c"]);
    expect(p.matched).toHaveLength(3);
  });

  it("search mode shows all text matches as cards", () => {
    const busy = row("b", avail({ slots: [] }));
    const p = partitionQuickBookResults({
      results: [busy],
      searching: true,
      queryText: "cafe",
      textMatchIds: new Set(["b"]),
    });
    expect(p.cards.map((r) => r.venue.id)).toEqual(["b"]);
    expect(p.matched).toHaveLength(1);
  });
});

describe("emptyKind", () => {
  it("returns null while loading or on network failure (UI handles those)", () => {
    expect(emptyKind({ loading: true, failed: false, searching: false, matchedCount: 0, availableCount: 0, tooSmallCount: 0, resultsCount: 0 })).toBeNull();
    expect(emptyKind({ loading: false, failed: true, searching: false, matchedCount: 0, availableCount: 0, tooSmallCount: 0, resultsCount: 3 })).toBeNull();
  });

  it("detects search miss, all-too-small, and no free slots", () => {
    expect(
      emptyKind({
        loading: false,
        failed: false,
        searching: true,
        matchedCount: 0,
        availableCount: 0,
        tooSmallCount: 0,
        resultsCount: 5,
      }),
    ).toBe("search-miss");

    expect(
      emptyKind({
        loading: false,
        failed: false,
        searching: false,
        matchedCount: 3,
        availableCount: 0,
        tooSmallCount: 3,
        resultsCount: 3,
      }),
    ).toBe("too-small-all");

    expect(
      emptyKind({
        loading: false,
        failed: false,
        searching: false,
        matchedCount: 3,
        availableCount: 0,
        tooSmallCount: 1,
        resultsCount: 3,
      }),
    ).toBe("no-slots");
  });
});
