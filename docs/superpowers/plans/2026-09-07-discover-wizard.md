# Discover Preference Wizard + Guided Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/discover` preference wizard (stepper + guided chip chat) before the map, then redirect to a filtered and fit-ranked map of matching restaurants (with a skip path to the full map).

**Architecture:** Pure client preference model (`DiscoverPreferences`) with URL encode/decode and filter+rank helpers. `/discover` owns stepper + scripted chat over shared state. Landing hero primary CTA goes to `/discover`; secondary “Browse map” goes to `/#map`. Home map reads query prefs, filters/ranks `MapPlace`s client-side, and shows an active-filters bar.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, existing MapLibre `VenueMap`, `site-copy` i18n (RU/EN/RO), Vitest for pure lib tests.

**Spec:** `docs/superpowers/specs/2026-09-07-discover-wizard-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `foodassistant/apps/web/package.json` | Add `vitest` + `test` script |
| `foodassistant/apps/web/vitest.config.ts` | Vitest config (node env, `@/` alias) |
| `foodassistant/apps/web/src/lib/discover-preferences.ts` | Types, chip catalogs, URL codec, filter + fit-score rank |
| `foodassistant/apps/web/src/lib/discover-preferences.test.ts` | Unit tests for codec / filter / rank |
| `foodassistant/apps/web/src/lib/guided-chat-script.ts` | Scripted turn order + helpers that update prefs |
| `foodassistant/apps/web/src/lib/guided-chat-script.test.ts` | Unit tests for chat progression |
| `foodassistant/apps/web/src/lib/site-copy.ts` | Discover + map filter bar copy (RU/EN/RO) |
| `foodassistant/apps/web/src/components/discover/preference-stepper.tsx` | 5-step chip UI |
| `foodassistant/apps/web/src/components/discover/guided-chat.tsx` | Scripted chat panel UI |
| `foodassistant/apps/web/src/components/discover/preference-summary.tsx` | Sticky picks + Show map |
| `foodassistant/apps/web/src/components/discover/discover-wizard.tsx` | Shared state + layout + redirect |
| `foodassistant/apps/web/src/components/discover/active-filters-bar.tsx` | Map-section Edit / Clear bar |
| `foodassistant/apps/web/src/app/discover/page.tsx` | `/discover` route |
| `foodassistant/apps/web/src/app/page.tsx` | Hero CTAs + pass URL prefs into map |
| `foodassistant/apps/web/src/components/venue-map.tsx` | Accept ranked places / prefs; optional empty state |
| `foodassistant/apps/web/src/app/premium.css` | Discover + filter-bar styles |

---

### Task 1: Vitest + preference types, catalogs, URL codec (TDD)

**Files:**
- Modify: `foodassistant/apps/web/package.json`
- Create: `foodassistant/apps/web/vitest.config.ts`
- Create: `foodassistant/apps/web/src/lib/discover-preferences.ts`
- Create: `foodassistant/apps/web/src/lib/discover-preferences.test.ts`

- [ ] **Step 1: Add Vitest**

In `foodassistant/apps/web`:

```bash
npm install -D vitest
```

Update `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `foodassistant/apps/web/vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Write failing codec tests**

Create `foodassistant/apps/web/src/lib/discover-preferences.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd foodassistant/apps/web && npm test -- src/lib/discover-preferences.test.ts
```

Expected: FAIL (module not found / exports missing).

- [ ] **Step 4: Implement types, catalogs, codec**

Create `foodassistant/apps/web/src/lib/discover-preferences.ts`:

```ts
import type { MapPlace } from "@/lib/api";

export type CuisineId =
  | "moldovan"
  | "italian"
  | "asian"
  | "european"
  | "fast_food"
  | "cafe_sweets";

export type RestaurantTypeId =
  | "restaurant"
  | "cafe"
  | "bar"
  | "fast_food"
  | "fine_dining";

export type OccasionId =
  | "quick_lunch"
  | "date_night"
  | "family"
  | "business"
  | "group";

export type PracticalId =
  | "open_now"
  | "free_tables"
  | "partners"
  | "nearby";

export type BudgetLevel = 1 | 2 | 3;

export type DiscoverPreferences = {
  cuisine: CuisineId[];
  restaurantType: RestaurantTypeId[];
  budget: BudgetLevel[];
  occasion: OccasionId[];
  practical: PracticalId[];
};

export const CUISINE_IDS: CuisineId[] = [
  "moldovan",
  "italian",
  "asian",
  "european",
  "fast_food",
  "cafe_sweets",
];

export const RESTAURANT_TYPE_IDS: RestaurantTypeId[] = [
  "restaurant",
  "cafe",
  "bar",
  "fast_food",
  "fine_dining",
];

export const BUDGET_LEVELS: BudgetLevel[] = [1, 2, 3];

export const OCCASION_IDS: OccasionId[] = [
  "quick_lunch",
  "date_night",
  "family",
  "business",
  "group",
];

export const PRACTICAL_IDS: PracticalId[] = [
  "open_now",
  "free_tables",
  "partners",
  "nearby",
];

const CUISINE_SET = new Set<string>(CUISINE_IDS);
const TYPE_SET = new Set<string>(RESTAURANT_TYPE_IDS);
const OCCASION_SET = new Set<string>(OCCASION_IDS);
const PRACTICAL_SET = new Set<string>(PRACTICAL_IDS);

export function emptyPreferences(): DiscoverPreferences {
  return {
    cuisine: [],
    restaurantType: [],
    budget: [],
    occasion: [],
    practical: [],
  };
}

export function hasAnyPreference(prefs: DiscoverPreferences): boolean {
  return (
    prefs.cuisine.length > 0 ||
    prefs.restaurantType.length > 0 ||
    prefs.budget.length > 0 ||
    prefs.occasion.length > 0 ||
    prefs.practical.length > 0
  );
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function encodePreferences(prefs: DiscoverPreferences): string {
  const params = new URLSearchParams();
  if (prefs.cuisine.length) params.set("cuisine", prefs.cuisine.join(","));
  if (prefs.restaurantType.length) {
    params.set("type", prefs.restaurantType.join(","));
  }
  if (prefs.budget.length) params.set("budget", prefs.budget.join(","));
  if (prefs.occasion.length) params.set("occasion", prefs.occasion.join(","));
  if (prefs.practical.length) {
    params.set("practical", prefs.practical.join(","));
  }
  return params.toString();
}

export function decodePreferences(search: string): DiscoverPreferences {
  const qs = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(qs);
  const budget = parseList(params.get("budget"))
    .map(Number)
    .filter((n): n is BudgetLevel => n === 1 || n === 2 || n === 3);

  return {
    cuisine: parseList(params.get("cuisine")).filter((id): id is CuisineId =>
      CUISINE_SET.has(id),
    ),
    restaurantType: parseList(params.get("type")).filter(
      (id): id is RestaurantTypeId => TYPE_SET.has(id),
    ),
    budget,
    occasion: parseList(params.get("occasion")).filter(
      (id): id is OccasionId => OCCASION_SET.has(id),
    ),
    practical: parseList(params.get("practical")).filter(
      (id): id is PracticalId => PRACTICAL_SET.has(id),
    ),
  };
}

export function toggleId<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Stub exports used by later tasks — implement in Task 2 */
export type RankOptions = {
  userLat?: number;
  userLng?: number;
  nearbyRadiusKm?: number;
};

export type ScoredPlace = {
  place: MapPlace;
  score: number;
};

export function filterAndRankPlaces(
  _places: MapPlace[],
  _prefs: DiscoverPreferences,
  _opts?: RankOptions,
): ScoredPlace[] {
  throw new Error("not implemented");
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd foodassistant/apps/web && npm test -- src/lib/discover-preferences.test.ts
```

Expected: PASS for the three codec tests. (If `filterAndRankPlaces` is imported only in later tests, codec suite alone passes.)

- [ ] **Step 6: Commit**

```bash
git add foodassistant/apps/web/package.json foodassistant/apps/web/package-lock.json \
  foodassistant/apps/web/vitest.config.ts \
  foodassistant/apps/web/src/lib/discover-preferences.ts \
  foodassistant/apps/web/src/lib/discover-preferences.test.ts
git commit -m "feat(web): add discover preferences types and URL codec"
```

---

### Task 2: Filter + fit-score ranking (TDD)

**Files:**
- Modify: `foodassistant/apps/web/src/lib/discover-preferences.ts`
- Modify: `foodassistant/apps/web/src/lib/discover-preferences.test.ts`

- [ ] **Step 1: Append failing filter/rank tests**

Add to `discover-preferences.test.ts`:

```ts
import { filterAndRankPlaces } from "./discover-preferences";
import type { MapPlace } from "@/lib/api";

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
    expect(ranked.map((r) => r.place.id)).toEqual(["a", "c", "b"]);
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
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd foodassistant/apps/web && npm test -- src/lib/discover-preferences.test.ts
```

Expected: FAIL with `not implemented` or wrong results.

- [ ] **Step 3: Implement filterAndRankPlaces**

Replace the stub in `discover-preferences.ts` with:

```ts
const CUISINE_ALIASES: Record<CuisineId, string[]> = {
  moldovan: ["moldovan", "молдав", "moldoven"],
  italian: ["italian", "итальян", "pizza", "pasta"],
  asian: ["asian", "азиат", "chinese", "japanese", "sushi", "thai"],
  european: ["european", "европ", "french", "german"],
  fast_food: ["fast food", "fast_food", "burger", "street"],
  cafe_sweets: ["cafe", "coffee", "dessert", "sweet", "кондитер", "кофе"],
};

const TYPE_ALIASES: Record<RestaurantTypeId, string[]> = {
  restaurant: ["restaurant", "ресторан"],
  cafe: ["cafe", "coffee", "кафе", "кофе"],
  bar: ["bar", "pub", "бар"],
  fast_food: ["fast", "burger", "street"],
  fine_dining: ["fine", "gourmet", "steak"],
};

function placeText(place: MapPlace): string {
  const parts = [
    place.name.ru,
    place.name.en,
    place.name.ro,
    ...(place.cuisine ?? []),
  ];
  return parts.join(" ").toLowerCase();
}

function cuisineMatches(place: MapPlace, ids: CuisineId[]): boolean {
  if (!ids.length) return true;
  const text = placeText(place);
  const cuisines = (place.cuisine ?? []).map((c) => c.toLowerCase());
  return ids.some((id) => {
    const aliases = CUISINE_ALIASES[id];
    return aliases.some(
      (a) => text.includes(a) || cuisines.some((c) => c.includes(a)),
    );
  });
}

function typeMatches(place: MapPlace, ids: RestaurantTypeId[]): boolean {
  if (!ids.length) return true;
  const text = placeText(place);
  return ids.some((id) => TYPE_ALIASES[id].some((a) => text.includes(a)));
}

function budgetMatches(place: MapPlace, levels: BudgetLevel[]): boolean {
  if (!levels.length) return true;
  if (typeof place.price_level !== "number") return false;
  return levels.includes(place.price_level as BudgetLevel);
}

function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function passesHardFilters(
  place: MapPlace,
  prefs: DiscoverPreferences,
  opts?: RankOptions,
): boolean {
  if (!cuisineMatches(place, prefs.cuisine)) return false;
  if (!typeMatches(place, prefs.restaurantType)) return false;
  if (!budgetMatches(place, prefs.budget)) return false;

  for (const p of prefs.practical) {
    if (p === "partners" && !place.in_database) return false;
    if (p === "open_now" && place.open_now !== true) return false;
    if (p === "free_tables" && !(typeof place.free_tables === "number" && place.free_tables > 0)) {
      return false;
    }
    if (p === "nearby") {
      if (opts?.userLat == null || opts?.userLng == null) continue;
      const radius = opts.nearbyRadiusKm ?? 3;
      if (haversineKm(opts.userLat, opts.userLng, place.lat, place.lng) > radius) {
        return false;
      }
    }
  }
  return true;
}

function occasionBonus(place: MapPlace, occasions: OccasionId[]): number {
  if (!occasions.length) return 0;
  let bonus = 0;
  const text = placeText(place);
  const price = place.price_level ?? 0;
  for (const o of occasions) {
    if (o === "quick_lunch" && (price <= 2 || text.includes("cafe") || text.includes("fast"))) {
      bonus += 8;
    }
    if (o === "date_night" && (price >= 2 || text.includes("wine") || text.includes("fine"))) {
      bonus += 8;
    }
    if (o === "family" && (place.in_database || text.includes("family"))) bonus += 6;
    if (o === "business" && price >= 2) bonus += 6;
    if (o === "group" && (place.free_tables ?? 0) >= 2) bonus += 6;
  }
  return bonus;
}

function scorePlace(
  place: MapPlace,
  prefs: DiscoverPreferences,
  opts?: RankOptions,
): number {
  if (!hasAnyPreference(prefs)) {
    return (place.in_database ? 1000 : 0) + (place.rating ?? 0) * 10;
  }

  let score = 0;
  if (prefs.cuisine.length && cuisineMatches(place, prefs.cuisine)) score += 40;
  if (prefs.budget.length && budgetMatches(place, prefs.budget)) score += 30;
  if (prefs.restaurantType.length && typeMatches(place, prefs.restaurantType)) {
    score += 20;
  }
  if (prefs.practical.includes("partners") && place.in_database) score += 15;
  if (prefs.practical.includes("open_now") && place.open_now === true) score += 12;
  if (
    prefs.practical.includes("free_tables") &&
    typeof place.free_tables === "number" &&
    place.free_tables > 0
  ) {
    score += 12;
  }
  score += occasionBonus(place, prefs.occasion);
  score += (place.rating ?? 0) * 2;

  if (
    prefs.practical.includes("nearby") &&
    opts?.userLat != null &&
    opts?.userLng != null
  ) {
    const km = haversineKm(opts.userLat, opts.userLng, place.lat, place.lng);
    score += Math.max(0, 15 - km * 3);
  }

  return score;
}

function defaultSort(a: MapPlace, b: MapPlace): number {
  if (a.in_database !== b.in_database) return a.in_database ? -1 : 1;
  const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
  if (ratingDiff !== 0) return ratingDiff;
  const nameA = a.name.en || a.name.ru || a.name.ro || "";
  const nameB = b.name.en || b.name.ru || b.name.ro || "";
  return nameA.localeCompare(nameB);
}

export function filterAndRankPlaces(
  places: MapPlace[],
  prefs: DiscoverPreferences,
  opts?: RankOptions,
): ScoredPlace[] {
  const filtered = places.filter((p) => passesHardFilters(p, prefs, opts));
  const scored = filtered.map((place) => ({
    place,
    score: scorePlace(place, prefs, opts),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return defaultSort(a.place, b.place);
  });
  return scored;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd foodassistant/apps/web && npm test -- src/lib/discover-preferences.test.ts
```

Expected: all PASS. Adjust alias/score weights only if a test fails for a clear reason.

- [ ] **Step 5: Commit**

```bash
git add foodassistant/apps/web/src/lib/discover-preferences.ts \
  foodassistant/apps/web/src/lib/discover-preferences.test.ts
git commit -m "feat(web): filter and rank map places by discover prefs"
```

---

### Task 3: Guided chat script (TDD)

**Files:**
- Create: `foodassistant/apps/web/src/lib/guided-chat-script.ts`
- Create: `foodassistant/apps/web/src/lib/guided-chat-script.test.ts`

- [ ] **Step 1: Write failing script tests**

```ts
import { describe, expect, it } from "vitest";
import {
  CHAT_STEPS,
  applyChatAnswer,
  nextChatStepIndex,
} from "./guided-chat-script";
import { emptyPreferences } from "./discover-preferences";

describe("guided-chat-script", () => {
  it("has five steps matching preference dimensions", () => {
    expect(CHAT_STEPS.map((s) => s.dimension)).toEqual([
      "cuisine",
      "restaurantType",
      "budget",
      "occasion",
      "practical",
    ]);
  });

  it("applyChatAnswer merges chip ids into prefs", () => {
    const prefs = applyChatAnswer(emptyPreferences(), "cuisine", ["italian"]);
    expect(prefs.cuisine).toEqual(["italian"]);
  });

  it("skip advances without changing prefs", () => {
    const prefs = emptyPreferences();
    expect(nextChatStepIndex(0, true)).toBe(1);
    expect(prefs).toEqual(emptyPreferences());
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd foodassistant/apps/web && npm test -- src/lib/guided-chat-script.test.ts
```

- [ ] **Step 3: Implement script**

Create `foodassistant/apps/web/src/lib/guided-chat-script.ts`:

```ts
import {
  type BudgetLevel,
  type CuisineId,
  type DiscoverPreferences,
  type OccasionId,
  type PracticalId,
  type RestaurantTypeId,
} from "./discover-preferences";

export type ChatDimension =
  | "cuisine"
  | "restaurantType"
  | "budget"
  | "occasion"
  | "practical";

export type ChatStep = {
  dimension: ChatDimension;
  /** key into site-copy.discover.chatQuestions */
  questionKey: ChatDimension;
};

export const CHAT_STEPS: ChatStep[] = [
  { dimension: "cuisine", questionKey: "cuisine" },
  { dimension: "restaurantType", questionKey: "restaurantType" },
  { dimension: "budget", questionKey: "budget" },
  { dimension: "occasion", questionKey: "occasion" },
  { dimension: "practical", questionKey: "practical" },
];

export function nextChatStepIndex(current: number, _skipped: boolean): number {
  return Math.min(current + 1, CHAT_STEPS.length);
}

export function applyChatAnswer(
  prefs: DiscoverPreferences,
  dimension: ChatDimension,
  ids: string[],
): DiscoverPreferences {
  switch (dimension) {
    case "cuisine":
      return { ...prefs, cuisine: ids as CuisineId[] };
    case "restaurantType":
      return { ...prefs, restaurantType: ids as RestaurantTypeId[] };
    case "budget":
      return {
        ...prefs,
        budget: ids.map(Number).filter((n): n is BudgetLevel => n === 1 || n === 2 || n === 3),
      };
    case "occasion":
      return { ...prefs, occasion: ids as OccasionId[] };
    case "practical":
      return { ...prefs, practical: ids as PracticalId[] };
  }
}

export function isChatComplete(stepIndex: number): boolean {
  return stepIndex >= CHAT_STEPS.length;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd foodassistant/apps/web && npm test -- src/lib/guided-chat-script.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add foodassistant/apps/web/src/lib/guided-chat-script.ts \
  foodassistant/apps/web/src/lib/guided-chat-script.test.ts
git commit -m "feat(web): add guided discover chat script helpers"
```

---

### Task 4: site-copy for discover + map filter bar

**Files:**
- Modify: `foodassistant/apps/web/src/lib/site-copy.ts`

- [ ] **Step 1: Extend copy type shape**

Inside each locale (`ru`, `en`, `ro`), add under `home`:

```ts
browseMap: "…",
```

And add a top-level `discover` object per locale (sibling of `home`):

```ts
discover: {
  title: "…",
  lead: "…",
  browseMap: "…",
  showMap: "…",
  skipStep: "…",
  back: "…",
  next: "…",
  askHelp: "…",
  yourPicks: "…",
  steps: {
    cuisine: "…",
    restaurantType: "…",
    budget: "…",
    occasion: "…",
    practical: "…",
  },
  chips: {
    moldovan: "…", italian: "…", asian: "…", european: "…",
    fast_food: "…", cafe_sweets: "…",
    restaurant: "…", cafe: "…", bar: "…", fine_dining: "…",
    budget1: "$", budget2: "$$", budget3: "$$$",
    quick_lunch: "…", date_night: "…", family: "…", business: "…", group: "…",
    open_now: "…", free_tables: "…", partners: "…", nearby: "…",
  },
  chatQuestions: {
    cuisine: "…",
    restaurantType: "…",
    budget: "…",
    occasion: "…",
    practical: "…",
  },
  chatAck: "…", // e.g. "Got it."
  chatDone: "…", // e.g. "Ready when you are — show the map."
  chatSkip: "…",
  filtersActive: "…",
  filtersEdit: "…",
  filtersClear: "…",
  filtersEmpty: "…",
  recommended: "…",
  nearbyDenied: "…",
},
```

English examples:

- `browseMap`: `"Browse map"`
- `title`: `"What are you looking for?"`
- `lead`: `"Tell us a few preferences — or ask the assistant — then we’ll recommend places on the map."`
- `showMap`: `"Show recommendations"`
- `askHelp`: `"Ask for help"`
- `filtersActive`: `"Active preferences"`
- `filtersEmpty`: `"No places match. Clear filters or edit preferences."`
- `recommended`: `"Recommended"`

Mirror RU and RO with natural translations (same keys).

Also update `home.find` remains “Find a restaurant”; add `home.browseMap`.

- [ ] **Step 2: TypeScript check**

```bash
cd foodassistant/apps/web && npx tsc --noEmit
```

Expected: PASS (or only pre-existing unrelated errors). Fix missing keys if `getSiteCopy` consumers break.

- [ ] **Step 3: Commit**

```bash
git add foodassistant/apps/web/src/lib/site-copy.ts
git commit -m "feat(web): add discover wizard and filter-bar copy"
```

---

### Task 5: Preference stepper + summary components

**Files:**
- Create: `foodassistant/apps/web/src/components/discover/preference-stepper.tsx`
- Create: `foodassistant/apps/web/src/components/discover/preference-summary.tsx`

- [ ] **Step 1: Implement PreferenceStepper**

```tsx
"use client";

import {
  BUDGET_LEVELS,
  CUISINE_IDS,
  OCCASION_IDS,
  PRACTICAL_IDS,
  RESTAURANT_TYPE_IDS,
  toggleId,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

const STEPS = [
  "cuisine",
  "restaurantType",
  "budget",
  "occasion",
  "practical",
] as const;

type StepKey = (typeof STEPS)[number];

type Props = {
  stepIndex: number;
  prefs: DiscoverPreferences;
  onPrefsChange: (prefs: DiscoverPreferences) => void;
  onStepChange: (index: number) => void;
};

export function PreferenceStepper({
  stepIndex,
  prefs,
  onPrefsChange,
  onStepChange,
}: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)] as StepKey;

  function chipsForStep(): { id: string; label: string; selected: boolean }[] {
    switch (step) {
      case "cuisine":
        return CUISINE_IDS.map((id) => ({
          id,
          label: copy.chips[id],
          selected: prefs.cuisine.includes(id),
        }));
      case "restaurantType":
        return RESTAURANT_TYPE_IDS.map((id) => ({
          id,
          label: copy.chips[id === "fast_food" ? "fast_food" : id],
          selected: prefs.restaurantType.includes(id),
        }));
      case "budget":
        return BUDGET_LEVELS.map((level) => ({
          id: String(level),
          label: copy.chips[`budget${level}` as "budget1"],
          selected: prefs.budget.includes(level),
        }));
      case "occasion":
        return OCCASION_IDS.map((id) => ({
          id,
          label: copy.chips[id],
          selected: prefs.occasion.includes(id),
        }));
      case "practical":
        return PRACTICAL_IDS.map((id) => ({
          id,
          label: copy.chips[id],
          selected: prefs.practical.includes(id),
        }));
    }
  }

  function toggle(id: string) {
    switch (step) {
      case "cuisine":
        onPrefsChange({
          ...prefs,
          cuisine: toggleId(prefs.cuisine, id as typeof prefs.cuisine[number]),
        });
        break;
      case "restaurantType":
        onPrefsChange({
          ...prefs,
          restaurantType: toggleId(
            prefs.restaurantType,
            id as typeof prefs.restaurantType[number],
          ),
        });
        break;
      case "budget": {
        const level = Number(id) as 1 | 2 | 3;
        onPrefsChange({
          ...prefs,
          budget: toggleId(prefs.budget, level),
        });
        break;
      }
      case "occasion":
        onPrefsChange({
          ...prefs,
          occasion: toggleId(prefs.occasion, id as typeof prefs.occasion[number]),
        });
        break;
      case "practical":
        onPrefsChange({
          ...prefs,
          practical: toggleId(
            prefs.practical,
            id as typeof prefs.practical[number],
          ),
        });
        break;
    }
  }

  return (
    <div className="discover-stepper">
      <ol className="discover-stepper-tabs" aria-label="Steps">
        {STEPS.map((key, i) => (
          <li key={key}>
            <button
              type="button"
              className={i === stepIndex ? "on" : ""}
              onClick={() => onStepChange(i)}
            >
              {copy.steps[key]}
            </button>
          </li>
        ))}
      </ol>
      <h2>{copy.steps[step]}</h2>
      <div className="discover-chips" role="group">
        {chipsForStep().map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`discover-chip ${chip.selected ? "on" : ""}`}
            aria-pressed={chip.selected}
            onClick={() => toggle(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="discover-stepper-nav">
        <button
          type="button"
          className="btn btn-outline"
          disabled={stepIndex === 0}
          onClick={() => onStepChange(stepIndex - 1)}
        >
          {copy.back}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={stepIndex >= STEPS.length - 1}
          onClick={() => onStepChange(stepIndex + 1)}
        >
          {copy.next}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement PreferenceSummary**

```tsx
"use client";

import Link from "next/link";
import type { DiscoverPreferences } from "@/lib/discover-preferences";
import { encodePreferences, hasAnyPreference } from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type Props = {
  prefs: DiscoverPreferences;
  onShowMap: () => void;
};

export function PreferenceSummary({ prefs, onShowMap }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const labels: string[] = [
    ...prefs.cuisine.map((id) => copy.chips[id]),
    ...prefs.restaurantType.map((id) => copy.chips[id]),
    ...prefs.budget.map((b) => copy.chips[`budget${b}` as "budget1"]),
    ...prefs.occasion.map((id) => copy.chips[id]),
    ...prefs.practical.map((id) => copy.chips[id]),
  ];

  return (
    <div className="discover-summary">
      <div>
        <span className="eyebrow">{copy.yourPicks}</span>
        <div className="discover-summary-picks">
          {labels.length === 0 ? (
            <span className="muted">—</span>
          ) : (
            labels.map((label) => (
              <span key={label} className="discover-chip on">
                {label}
              </span>
            ))
          )}
        </div>
      </div>
      <div className="discover-summary-actions">
        <Link href="/#map" className="btn btn-outline">
          {copy.browseMap}
        </Link>
        <button type="button" className="btn btn-gold" onClick={onShowMap}>
          {copy.showMap}
          {hasAnyPreference(prefs) ? "" : ""}
        </button>
      </div>
    </div>
  );
}

export function buildMapHref(prefs: DiscoverPreferences): string {
  const qs = encodePreferences(prefs);
  return qs ? `/?${qs}#map` : "/#map";
}
```

- [ ] **Step 3: Commit**

```bash
git add foodassistant/apps/web/src/components/discover/preference-stepper.tsx \
  foodassistant/apps/web/src/components/discover/preference-summary.tsx
git commit -m "feat(web): add discover stepper and preference summary"
```

---

### Task 6: Guided chat UI

**Files:**
- Create: `foodassistant/apps/web/src/components/discover/guided-chat.tsx`

- [ ] **Step 1: Implement GuidedChat**

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  BUDGET_LEVELS,
  CUISINE_IDS,
  OCCASION_IDS,
  PRACTICAL_IDS,
  RESTAURANT_TYPE_IDS,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import {
  CHAT_STEPS,
  applyChatAnswer,
  isChatComplete,
  nextChatStepIndex,
  type ChatDimension,
} from "@/lib/guided-chat-script";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type Props = {
  prefs: DiscoverPreferences;
  onPrefsChange: (prefs: DiscoverPreferences) => void;
  collapsedDefault?: boolean;
};

type Msg = { role: "assistant" | "user"; text: string };

export function GuidedChat({
  prefs,
  onPrefsChange,
  collapsedDefault = false,
}: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const [open, setOpen] = useState(!collapsedDefault);
  const [stepIndex, setStepIndex] = useState(0);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: copy.chatQuestions.cuisine },
  ]);

  const dimension: ChatDimension | null = isChatComplete(stepIndex)
    ? null
    : CHAT_STEPS[stepIndex].dimension;

  const options = useMemo(() => {
    if (!dimension) return [];
    switch (dimension) {
      case "cuisine":
        return CUISINE_IDS.map((id) => ({ id, label: copy.chips[id] }));
      case "restaurantType":
        return RESTAURANT_TYPE_IDS.map((id) => ({ id, label: copy.chips[id] }));
      case "budget":
        return BUDGET_LEVELS.map((b) => ({
          id: String(b),
          label: copy.chips[`budget${b}` as "budget1"],
        }));
      case "occasion":
        return OCCASION_IDS.map((id) => ({ id, label: copy.chips[id] }));
      case "practical":
        return PRACTICAL_IDS.map((id) => ({ id, label: copy.chips[id] }));
    }
  }, [dimension, copy]);

  function finishAnswer(ids: string[], label: string) {
    if (!dimension) return;
    const nextPrefs = applyChatAnswer(prefs, dimension, ids);
    onPrefsChange(nextPrefs);
    const next = nextChatStepIndex(stepIndex, false);
    setMessages((m) => [
      ...m,
      { role: "user", text: label },
      {
        role: "assistant",
        text: isChatComplete(next)
          ? copy.chatDone
          : `${copy.chatAck} ${copy.chatQuestions[CHAT_STEPS[next].questionKey]}`,
      },
    ]);
    setStepIndex(next);
  }

  function skip() {
    const next = nextChatStepIndex(stepIndex, true);
    setMessages((m) => [
      ...m,
      { role: "user", text: copy.chatSkip },
      {
        role: "assistant",
        text: isChatComplete(next)
          ? copy.chatDone
          : copy.chatQuestions[CHAT_STEPS[next].questionKey],
      },
    ]);
    setStepIndex(next);
  }

  return (
    <aside className={`discover-chat ${open ? "open" : ""}`}>
      <button
        type="button"
        className="discover-chat-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {copy.askHelp}
      </button>
      {open && (
        <div className="discover-chat-panel">
          <div className="discover-chat-log" aria-live="polite">
            {messages.map((msg, i) => (
              <p key={i} className={`discover-chat-msg ${msg.role}`}>
                {msg.text}
              </p>
            ))}
          </div>
          {dimension && (
            <div className="discover-chips">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="discover-chip"
                  onClick={() => finishAnswer([opt.id], opt.label)}
                >
                  {opt.label}
                </button>
              ))}
              <button type="button" className="discover-chip" onClick={skip}>
                {copy.chatSkip}
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
```

Note: multi-select in chat can be a follow-up enhancement; v1 sends one chip per turn (spec allows chips; stepper still supports multi-select).

- [ ] **Step 2: Commit**

```bash
git add foodassistant/apps/web/src/components/discover/guided-chat.tsx
git commit -m "feat(web): add guided discover chat panel"
```

---

### Task 7: Discover wizard page + route

**Files:**
- Create: `foodassistant/apps/web/src/components/discover/discover-wizard.tsx`
- Create: `foodassistant/apps/web/src/app/discover/page.tsx`

- [ ] **Step 1: Implement DiscoverWizard**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { GuidedChat } from "@/components/discover/guided-chat";
import { PreferenceStepper } from "@/components/discover/preference-stepper";
import {
  PreferenceSummary,
  buildMapHref,
} from "@/components/discover/preference-summary";
import {
  decodePreferences,
  emptyPreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

export function DiscoverWizard() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = useMemo(
    () => decodePreferences(searchParams.toString()),
    [searchParams],
  );
  const [prefs, setPrefs] = useState(initial);
  const [stepIndex, setStepIndex] = useState(0);

  function showMap() {
    router.push(buildMapHref(prefs));
  }

  return (
    <div className="discover-page">
      <SiteHeader />
      <main className="discover-main">
        <header className="discover-hero">
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </header>
        <div className="discover-layout">
          <PreferenceStepper
            stepIndex={stepIndex}
            prefs={prefs}
            onPrefsChange={setPrefs}
            onStepChange={setStepIndex}
          />
          <GuidedChat
            prefs={prefs}
            onPrefsChange={setPrefs}
            collapsedDefault={typeof window !== "undefined" && window.innerWidth < 900}
          />
        </div>
        <PreferenceSummary prefs={prefs} onShowMap={showMap} />
      </main>
    </div>
  );
}
```

Fix SSR hydration for `collapsedDefault`: pass `collapsedDefault={true}` always and let CSS expand on desktop, **or** use a small `useEffect` to open on desktop. Prefer:

```tsx
const [collapsedDefault, setCollapsedDefault] = useState(true);
useEffect(() => {
  setCollapsedDefault(window.matchMedia("(max-width: 899px)").matches);
}, []);
```

Pass that into `GuidedChat` only after mount, or keep chat collapsed by default on all viewports with a clear toggle (simplest, matches spec “collapsed by default on mobile”).

- [ ] **Step 2: Create page**

`foodassistant/apps/web/src/app/discover/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { DiscoverWizard } from "@/components/discover/discover-wizard";

export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverWizard />
    </Suspense>
  );
}
```

- [ ] **Step 3: Smoke-check route**

```bash
cd foodassistant/apps/web && npm run build
```

Expected: build succeeds; `/discover` in routes.

- [ ] **Step 4: Commit**

```bash
git add foodassistant/apps/web/src/components/discover/discover-wizard.tsx \
  foodassistant/apps/web/src/app/discover/page.tsx
git commit -m "feat(web): add /discover preference wizard page"
```

---

### Task 8: Landing hero CTAs

**Files:**
- Modify: `foodassistant/apps/web/src/app/page.tsx`
- Modify: `foodassistant/apps/web/src/lib/site-copy.ts` (if `browseMap` not already on `home`)

- [ ] **Step 1: Update hero CTAs**

In `page.tsx`, replace the single gold CTA block with:

```tsx
<div className="landing-ctas">
  <Link href="/discover" className="btn btn-gold">
    {copy.find} <span>→</span>
  </Link>
  <Link href="#map" className="btn btn-outline">
    {copy.browseMap}
  </Link>
  <Link href="/business" className="btn btn-outline">
    {copy.connect}
  </Link>
</div>
```

Ensure `home.browseMap` exists in all three locales (Task 4). If three buttons feel crowded, keep **Find** + **Browse map** in `.landing-ctas` and move Connect under trust/owner section only if already present elsewhere — prefer keeping Connect as tertiary outline.

- [ ] **Step 2: Commit**

```bash
git add foodassistant/apps/web/src/app/page.tsx foodassistant/apps/web/src/lib/site-copy.ts
git commit -m "feat(web): route Find CTA through discover wizard"
```

---

### Task 9: Active filters bar + VenueMap ranking

**Files:**
- Create: `foodassistant/apps/web/src/components/discover/active-filters-bar.tsx`
- Modify: `foodassistant/apps/web/src/app/page.tsx`
- Modify: `foodassistant/apps/web/src/components/venue-map.tsx`

- [ ] **Step 1: ActiveFiltersBar**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  encodePreferences,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type Props = {
  prefs: DiscoverPreferences;
};

export function ActiveFiltersBar({ prefs }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const router = useRouter();
  const qs = encodePreferences(prefs);
  const editHref = qs ? `/discover?${qs}` : "/discover";

  return (
    <div className="discover-filters-bar" role="status">
      <strong>{copy.filtersActive}</strong>
      <div className="discover-filters-actions">
        <Link href={editHref} className="btn btn-outline">
          {copy.filtersEdit}
        </Link>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => router.push("/#map")}
        >
          {copy.filtersClear}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire home page**

In `page.tsx` (client), read prefs:

```tsx
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import {
  decodePreferences,
  hasAnyPreference,
} from "@/lib/discover-preferences";
import { ActiveFiltersBar } from "@/components/discover/active-filters-bar";

function HomeMapSection() {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).home;
  const searchParams = useSearchParams();
  const prefs = useMemo(
    () => decodePreferences(searchParams.toString()),
    [searchParams],
  );
  const filtered = hasAnyPreference(prefs);

  return (
    <section className="landing-map-section" id="map">
      <div className="section-heading split">
        <div>
          <span className="eyebrow">{copy.mapEyebrow}</span>
          <h2 style={{ whiteSpace: "pre-line" }}>{copy.mapTitle}</h2>
        </div>
        <p>{copy.mapBody}</p>
      </div>
      {filtered && <ActiveFiltersBar prefs={prefs} />}
      <VenueMap preferences={filtered ? prefs : undefined} />
    </section>
  );
}
```

Wrap `HomeMapSection` in `<Suspense>` from the page body. Keep the rest of `HomePage` as today.

- [ ] **Step 3: Update VenueMap to accept preferences**

Change signature:

```tsx
import {
  filterAndRankPlaces,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";

export function VenueMap({
  compact = false,
  preferences,
}: {
  compact?: boolean;
  preferences?: DiscoverPreferences;
}) {
```

After fetch, keep raw places in state `allPlaces`. Derive display list:

```tsx
const [allPlaces, setAllPlaces] = useState<MapPlace[]>([]);
const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);

// in fetch effect:
setAllPlaces(sortPlaces(data.places ?? []));

const ranked = useMemo(() => {
  if (!preferences) return allPlaces.map((place) => ({ place, score: 0 }));
  return filterAndRankPlaces(allPlaces, preferences, {
    userLat: userGeo?.lat,
    userLng: userGeo?.lng,
  });
}, [allPlaces, preferences, userGeo]);

const places = ranked.map((r) => r.place);
```

Use `places` everywhere the UI currently uses `places` (markers, list, selection).

When `preferences` is set and `places.length === 0` and not loading, show empty state using `getSiteCopy(locale).discover.filtersEmpty` plus links already on `ActiveFiltersBar`.

Optional: mark first 3 list items with `copy.recommended` badge when `preferences` is set.

Listen once for geolocation when `preferences?.practical.includes("nearby")`:

```tsx
useEffect(() => {
  if (!preferences?.practical.includes("nearby")) return;
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => {
      /* nearby ignored; optional soft notice via state flag */
    },
    { enableHighAccuracy: true, timeout: 8000 },
  );
}, [preferences]);
```

- [ ] **Step 4: Manual check**

1. `/discover` → pick Italian + $$ → Show map → URL has query + `#map`  
2. List shows matching / ranked places  
3. Clear filters → full map  
4. Browse map from hero → no filters  

- [ ] **Step 5: Commit**

```bash
git add foodassistant/apps/web/src/components/discover/active-filters-bar.tsx \
  foodassistant/apps/web/src/app/page.tsx \
  foodassistant/apps/web/src/components/venue-map.tsx
git commit -m "feat(web): apply discover prefs as ranked map recommendations"
```

---

### Task 10: Discover styles

**Files:**
- Modify: `foodassistant/apps/web/src/app/premium.css` (or `globals.css` if discover styles fit better with existing landing tokens)

- [ ] **Step 1: Add CSS**

Reuse existing `--fa-*` tokens. Add:

```css
.discover-page { min-height: 100vh; }
.discover-main { max-width: 1100px; margin: 0 auto; padding: 6rem 1.25rem 8rem; }
.discover-hero h1 { font-family: var(--fa-display, Fraunces, serif); }
.discover-layout {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 1.5rem;
  align-items: start;
}
.discover-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.discover-chip {
  border: 1px solid color-mix(in oklab, var(--fa-gold, #c4a35a) 45%, transparent);
  background: transparent;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  cursor: pointer;
}
.discover-chip.on { background: var(--fa-gold, #c4a35a); color: #111; }
.discover-summary {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  backdrop-filter: blur(8px);
  background: color-mix(in oklab, #0b1a14 85%, transparent);
}
.discover-filters-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.discover-chat-msg.assistant { opacity: 0.9; }
.discover-chat-msg.user { font-weight: 600; }

@media (max-width: 899px) {
  .discover-layout { grid-template-columns: 1fr; }
}
```

Tune to match existing landing look; do not introduce purple/cream AI-default palettes.

- [ ] **Step 2: Visual pass**

```bash
cd foodassistant/apps/web && npm run dev
```

Check `/discover` desktop + narrow viewport and `/?cuisine=italian#map`.

- [ ] **Step 3: Commit**

```bash
git add foodassistant/apps/web/src/app/premium.css
git commit -m "style(web): layout discover wizard and active filters bar"
```

---

### Task 11: Final verification

- [ ] **Step 1: Unit tests**

```bash
cd foodassistant/apps/web && npm test
```

Expected: all discover unit tests PASS.

- [ ] **Step 2: Build**

```bash
cd foodassistant/apps/web && npm run build
```

Expected: success.

- [ ] **Step 3: Manual checklist**

- [ ] Hero **Find** → `/discover`
- [ ] Hero **Browse map** → `/#map` unfiltered
- [ ] Stepper multi-select works across 5 steps
- [ ] Guided chat fills same prefs
- [ ] **Show recommendations** → `/?…#map` with ranked list
- [ ] Active bar Edit / Clear
- [ ] Empty matches state
- [ ] RU/EN/RO labels present

- [ ] **Step 4: Commit any fixes** (only if needed)

```bash
git commit -m "fix(web): polish discover wizard edge cases"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| Wizard before map | 7, 8 |
| Guided chip chat (no LLM) | 3, 6 |
| Cuisine / type / budget / occasion / practical | 1, 2, 5 |
| Primary CTA wizard / secondary browse map | 8 |
| Redirect with query before hash | 5 (`buildMapHref`), 7 |
| Client filter + fit rank | 2, 9 |
| Active filters Edit / Clear | 9 |
| Skip / empty prefs → full map | 5, 9 |
| Nearby geo denied soft ignore | 9 |
| i18n RU/EN/RO | 4 |
| Web first; no new API | all tasks |
| Unit tests codec / filter / chat | 1–3 |

## Placeholder scan

No TBD/TODO steps; concrete code and commands included.

## Type consistency

- `DiscoverPreferences` fields: `cuisine`, `restaurantType`, `budget`, `occasion`, `practical` — used consistently across lib, chat, UI, URL (`type` query key ↔ `restaurantType`).
- `filterAndRankPlaces` → `ScoredPlace[]` consumed by `VenueMap`.
- `buildMapHref` → `/?${qs}#map`.
