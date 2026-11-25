# Discover Categories Density + MDL Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/discover` preference box feel less empty with denser tile chips + icons, and replace $/$/$/$ budget UI with a single MDL dual-thumb range plus preset buttons.

**Architecture:** Extend `DiscoverPreferences.budget` from `BudgetLevel[]` to `BudgetMdlRange | null`. Soft-map MDL ranges to existing `price_level` 1–3 for filter/score. Expand `*_PRIMARY` chip lists, restyle chips as a tile grid with a small id→glyph icon map, and rebuild the budget step UI (overlapped dual range inputs + preset tiles). Update guided-chat budget answers to presets. Work on branch `feat/discover-preference-box-polish`.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, `site-copy` i18n, CSS in `premium.css`.

**Spec:** `docs/superpowers/specs/2026-09-16-discover-categories-density-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `seatiko/apps/web/src/lib/discover-preferences.ts` | MDL budget type, clamp/snap, presets, URL encode/decode, soft `price_level` map, expanded PRIMARY lists, `hasAnyPreference` |
| `seatiko/apps/web/src/lib/discover-preferences.test.ts` | Tests for budget helpers, URL, filter/score with MDL |
| `seatiko/apps/web/src/lib/discover-chip-icons.ts` | Pure chip-id → glyph string map |
| `seatiko/apps/web/src/lib/discover-chip-icons.test.ts` | Coverage that every chip id has an icon |
| `seatiko/apps/web/src/lib/guided-chat-script.ts` | Apply budget answers as MDL presets / ranges |
| `seatiko/apps/web/src/lib/guided-chat-script.test.ts` | Update budget assertions |
| `seatiko/apps/web/src/lib/site-copy.ts` | EN/RU/RO budget + preset labels; drop `$`/`$$`/`$$$` |
| `seatiko/apps/web/src/components/discover/preference-stepper.tsx` | Tile chips, icons, MDL range + presets, selectedCount for budget |
| `seatiko/apps/web/src/components/discover/guided-chat.tsx` | Budget options = presets |
| `seatiko/apps/web/src/app/premium.css` | Tile grid, inner panel, dual-range track, drop stepper `min-height: 560px` |

Out of scope: chat script rewrite beyond budget options, map chrome, Flutter, real venue MDL prices API.

---

### Task 1: MDL budget model helpers (TDD)

**Files:**
- Modify: `seatiko/apps/web/src/lib/discover-preferences.ts`
- Modify: `seatiko/apps/web/src/lib/discover-preferences.test.ts`

- [ ] **Step 1: Replace budget helper tests with MDL-focused failing tests**

In `seatiko/apps/web/src/lib/discover-preferences.test.ts`, replace the `budget range helpers` describe block and update encode/decode + filter tests that use `budget: [n]`:

```ts
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

  it("budget presets snap known ids and match ranges", () => {
    expect(budgetPresetRange("under200")).toEqual({ min: 50, max: 200 });
    expect(budgetPresetRange("200_400")).toEqual({ min: 200, max: 400 });
    expect(budgetPresetRange("any")).toBeNull();
    expect(matchBudgetPreset({ min: 200, max: 400 })).toBe("200_400");
    expect(matchBudgetPreset({ min: 150, max: 400 })).toBeNull();
  });
});

describe("encodePreferences / decodePreferences", () => {
  it("round-trips full prefs with MDL budget", () => {
    const prefs: DiscoverPreferences = {
      cuisine: ["italian", "asian"],
      restaurantType: ["cafe"],
      budget: { min: 200, max: 400 },
      occasion: ["date_night"],
      practical: ["open_now", "partners"],
    };
    const qs = encodePreferences(prefs);
    expect(qs).toContain("budget=200-400");
    expect(decodePreferences(qs)).toEqual(prefs);
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
    expect(decodePreferences("budget=2,9").budget).toBeNull();
    expect(decodePreferences("budget=abc").budget).toBeNull();
  });
});
```

Also update filter tests that used `budget: [1]` / `budget: [2]`:

```ts
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
```

Keep the existing `place()` helper and other filter tests unchanged except budget shape.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd seatiko/apps/web && npx vitest run src/lib/discover-preferences.test.ts
```

Expected: FAIL (missing exports / type errors on `budget: { min, max }`).

- [ ] **Step 3: Implement MDL budget model**

In `seatiko/apps/web/src/lib/discover-preferences.ts`:

1. Replace `BudgetLevel` usage on prefs with:

```ts
export type BudgetLevel = 1 | 2 | 3; // still used by soft-map / occasion helpers

export type BudgetMdlRange = { min: number; max: number };

export type BudgetPresetId =
  | "under200"
  | "200_400"
  | "400_700"
  | "700_1000"
  | "any";

export const BUDGET_MDL_MIN = 50;
export const BUDGET_MDL_MAX = 1000;
export const BUDGET_MDL_STEP = 50;

export const BUDGET_PRESET_IDS: Exclude<BudgetPresetId, "any">[] = [
  "under200",
  "200_400",
  "400_700",
  "700_1000",
];

const BUDGET_PRESET_RANGES: Record<
  Exclude<BudgetPresetId, "any">,
  BudgetMdlRange
> = {
  under200: { min: 50, max: 200 },
  "200_400": { min: 200, max: 400 },
  "400_700": { min: 400, max: 700 },
  "700_1000": { min: 700, max: 1000 },
};

export type DiscoverPreferences = {
  cuisine: CuisineId[];
  restaurantType: RestaurantTypeId[];
  budget: BudgetMdlRange | null;
  occasion: OccasionId[];
  practical: PracticalId[];
};
```

2. Remove `BUDGET_LEVELS`, `budgetLevelsFromRange`, `budgetRangeFromLevels` (or keep `BUDGET_LEVELS` only if guided-chat still needs it — prefer removing).

3. Add helpers:

```ts
function snapMdl(n: number): number {
  const clamped = Math.min(BUDGET_MDL_MAX, Math.max(BUDGET_MDL_MIN, n));
  return Math.round(clamped / BUDGET_MDL_STEP) * BUDGET_MDL_STEP;
}

export function normalizeBudgetRange(range: BudgetMdlRange): BudgetMdlRange {
  let min = snapMdl(range.min);
  let max = snapMdl(range.max);
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

/** Soft bands (spec): 50–250→1, 200–550→2, 500–1000→3 (overlap OK). */
export function priceLevelsForMdlRange(
  range: BudgetMdlRange | null,
): BudgetLevel[] {
  if (!range) return [];
  const { min, max } = normalizeBudgetRange(range);
  const levels: BudgetLevel[] = [];
  if (max >= 50 && min <= 250) levels.push(1);
  if (max >= 200 && min <= 550) levels.push(2);
  if (max >= 500 && min <= 1000) levels.push(3);
  return levels;
}

export function budgetPresetRange(
  id: BudgetPresetId,
): BudgetMdlRange | null {
  if (id === "any") return null;
  return { ...BUDGET_PRESET_RANGES[id] };
}

export function matchBudgetPreset(
  range: BudgetMdlRange | null,
): BudgetPresetId | null {
  if (!range) return "any";
  const n = normalizeBudgetRange(range);
  for (const id of BUDGET_PRESET_IDS) {
    const p = BUDGET_PRESET_RANGES[id];
    if (p.min === n.min && p.max === n.max) return id;
  }
  return null;
}
```

4. Update `emptyPreferences` → `budget: null`.  
5. Update `hasAnyPreference` → `prefs.budget != null`.  
6. Encode: if budget, `params.set("budget", `${min}-${max}`)`.  
7. Decode:

```ts
function parseBudgetParam(raw: string | null): BudgetMdlRange | null {
  if (!raw) return null;
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(raw.trim());
  if (!m) return null;
  return normalizeBudgetRange({ min: Number(m[1]), max: Number(m[2]) });
}
```

8. Update `budgetMatches` / `budgetScoreMatches` to take `BudgetMdlRange | null` and use `priceLevelsForMdlRange`:

```ts
function budgetMatches(place: MapPlace, range: BudgetMdlRange | null): boolean {
  const levels = priceLevelsForMdlRange(range);
  if (!levels.length) return true;
  if (typeof place.price_level !== "number") return true;
  return levels.includes(place.price_level as BudgetLevel);
}

function budgetScoreMatches(
  place: MapPlace,
  range: BudgetMdlRange | null,
): boolean {
  const levels = priceLevelsForMdlRange(range);
  if (!levels.length) return false;
  if (typeof place.price_level !== "number") return false;
  return levels.includes(place.price_level as BudgetLevel);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd seatiko/apps/web && npx vitest run src/lib/discover-preferences.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add seatiko/apps/web/src/lib/discover-preferences.ts seatiko/apps/web/src/lib/discover-preferences.test.ts
git commit -m "$(cat <<'EOF'
feat(web): model discover budget as MDL range

EOF
)"
```

---

### Task 2: Expand primary chip lists

**Files:**
- Modify: `seatiko/apps/web/src/lib/discover-preferences.ts`
- Modify: `seatiko/apps/web/src/lib/discover-preferences.test.ts` (add count assertions)

- [ ] **Step 1: Write failing primary-count test**

Append to `discover-preferences.test.ts`:

```ts
import {
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
} from "./discover-preferences";

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
```

- [ ] **Step 2: Run test — expect FAIL on lengths**

```bash
cd seatiko/apps/web && npx vitest run src/lib/discover-preferences.test.ts -t "primary chip counts"
```

- [ ] **Step 3: Move ids into PRIMARY**

Update constants to:

```ts
export const CUISINE_PRIMARY: CuisineId[] = [
  "moldovan",
  "italian",
  "asian",
  "european",
  "japanese",
  "chinese",
  "mexican",
  "seafood",
];
export const CUISINE_MORE: CuisineId[] = [
  "vegetarian",
  "grill",
  "fast_food",
  "cafe_sweets",
];

export const RESTAURANT_TYPE_PRIMARY: RestaurantTypeId[] = [
  "restaurant",
  "cafe",
  "bar",
  "fast_food",
  "fine_dining",
  "pub",
];
export const RESTAURANT_TYPE_MORE: RestaurantTypeId[] = [
  "pizzeria",
  "bakery",
  "wine_bar",
];

export const OCCASION_PRIMARY: OccasionId[] = [
  "quick_lunch",
  "date_night",
  "family",
  "business",
  "group",
  "brunch",
];
export const OCCASION_MORE: OccasionId[] = ["celebration", "solo"];

export const PRACTICAL_PRIMARY: PracticalId[] = [
  "open_now",
  "free_tables",
  "nearby",
  "partners",
  "outdoor",
  "parking",
];
export const PRACTICAL_MORE: PracticalId[] = ["wifi", "kid_friendly"];
```

Keep `*_IDS` as `[...PRIMARY, ...MORE]`.

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
cd seatiko/apps/web && npx vitest run src/lib/discover-preferences.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add seatiko/apps/web/src/lib/discover-preferences.ts seatiko/apps/web/src/lib/discover-preferences.test.ts
git commit -m "$(cat <<'EOF'
feat(web): show more discover chips by default

EOF
)"
```

---

### Task 3: Chip icon map (TDD)

**Files:**
- Create: `seatiko/apps/web/src/lib/discover-chip-icons.ts`
- Create: `seatiko/apps/web/src/lib/discover-chip-icons.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  CUISINE_IDS,
  RESTAURANT_TYPE_IDS,
  OCCASION_IDS,
  PRACTICAL_IDS,
  BUDGET_PRESET_IDS,
} from "./discover-preferences";
import { chipIcon } from "./discover-chip-icons";

describe("chipIcon", () => {
  it("returns a non-empty glyph for every discover chip id", () => {
    const ids = [
      ...CUISINE_IDS,
      ...RESTAURANT_TYPE_IDS,
      ...OCCASION_IDS,
      ...PRACTICAL_IDS,
      ...BUDGET_PRESET_IDS,
      "any",
    ];
    for (const id of ids) {
      expect(chipIcon(id).length, id).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
cd seatiko/apps/web && npx vitest run src/lib/discover-chip-icons.test.ts
```

- [ ] **Step 3: Implement icon map**

Create `seatiko/apps/web/src/lib/discover-chip-icons.ts`:

```ts
const ICONS: Record<string, string> = {
  moldovan: "🍇",
  italian: "🍝",
  asian: "🍜",
  european: "🍽️",
  japanese: "🍣",
  chinese: "🥡",
  mexican: "🌮",
  seafood: "🦐",
  vegetarian: "🥗",
  grill: "🔥",
  fast_food: "🍔",
  cafe_sweets: "☕",
  restaurant: "🍴",
  cafe: "☕",
  bar: "🍸",
  fine_dining: "✨",
  pub: "🍺",
  pizzeria: "🍕",
  bakery: "🥐",
  wine_bar: "🍷",
  quick_lunch: "⏱️",
  date_night: "💜",
  family: "👨‍👩‍👧",
  business: "💼",
  group: "👥",
  brunch: "🥞",
  celebration: "🎉",
  solo: "🧍",
  open_now: "🟢",
  free_tables: "🪑",
  nearby: "📍",
  partners: "✓",
  outdoor: "🌿",
  parking: "🅿️",
  wifi: "📶",
  kid_friendly: "🧒",
  under200: "↓",
  "200_400": "◆",
  "400_700": "◇",
  "700_1000": "↑",
  any: "∞",
};

export function chipIcon(id: string): string {
  return ICONS[id] ?? "•";
}
```

(Glyphs are fine; keep them simple. Prefer Unicode over a new icon package.)

- [ ] **Step 4: Run — expect PASS**

```bash
cd seatiko/apps/web && npx vitest run src/lib/discover-chip-icons.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add seatiko/apps/web/src/lib/discover-chip-icons.ts seatiko/apps/web/src/lib/discover-chip-icons.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add discover chip icon glyphs

EOF
)"
```

---

### Task 4: Guided chat budget → presets

**Files:**
- Modify: `seatiko/apps/web/src/lib/guided-chat-script.ts`
- Modify: `seatiko/apps/web/src/lib/guided-chat-script.test.ts`
- Modify: `seatiko/apps/web/src/components/discover/guided-chat.tsx`

- [ ] **Step 1: Update failing chat tests**

In `guided-chat-script.test.ts`, replace budget assertions:

```ts
    const withBudget = applyChatAnswer(withAsian, "budget", ["200_400"]);
    expect(withBudget.budget).toEqual({ min: 200, max: 400 });
    const cleared = applyChatAnswer(withBudget, "budget", ["any"]);
    expect(cleared.budget).toBeNull();
    const custom = applyChatAnswer(emptyPreferences(), "budget", ["150-450"]);
    expect(custom.budget).toEqual({ min: 150, max: 450 });
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd seatiko/apps/web && npx vitest run src/lib/guided-chat-script.test.ts
```

- [ ] **Step 3: Implement applyChatAnswer budget branch**

```ts
import {
  budgetPresetRange,
  normalizeBudgetRange,
  type BudgetPresetId,
  // ...other types
} from "./discover-preferences";

case "budget": {
  const raw = ids[0];
  if (!raw || raw === "any") return { ...prefs, budget: null };
  const preset = budgetPresetRange(raw as BudgetPresetId);
  if (preset) return { ...prefs, budget: preset };
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(raw);
  if (m) {
    return {
      ...prefs,
      budget: normalizeBudgetRange({
        min: Number(m[1]),
        max: Number(m[2]),
      }),
    };
  }
  return prefs;
}
```

Update `guided-chat.tsx` budget options:

```ts
import {
  BUDGET_PRESET_IDS,
  // remove BUDGET_LEVELS
} from "@/lib/discover-preferences";

case "budget":
  return [
    ...BUDGET_PRESET_IDS.map((id) => ({
      id,
      label: copy.budgetPresets[id],
    })),
    { id: "any", label: copy.budgetAny },
  ];
```

Remove `BudgetChipKey` / `budget1` usage.

- [ ] **Step 4: Run chat + prefs tests — expect PASS** (may still fail typecheck elsewhere until stepper updated; run these two files)

```bash
cd seatiko/apps/web && npx vitest run src/lib/guided-chat-script.test.ts src/lib/discover-preferences.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add seatiko/apps/web/src/lib/guided-chat-script.ts seatiko/apps/web/src/lib/guided-chat-script.test.ts seatiko/apps/web/src/components/discover/guided-chat.tsx
git commit -m "$(cat <<'EOF'
feat(web): map guided-chat budget answers to MDL presets

EOF
)"
```

---

### Task 5: i18n copy for MDL budget + presets

**Files:**
- Modify: `seatiko/apps/web/src/lib/site-copy.ts`

- [ ] **Step 1: Extend discover copy shape in all three locales**

For `ru`, `en`, `ro` under `discover`:

- Remove `chips.budget1` / `budget2` / `budget3`
- Add:

```ts
budgetPresets: {
  under200: "…",
  "200_400": "…",
  "400_700": "…",
  "700_1000": "…",
},
budgetHint: "…", // MDL range language
budgetAny: "…",  // keep key, update text if needed
budgetReadout: "{min} – {max} MDL", // for fillTemplate
```

EN examples:

```ts
budgetPresets: {
  under200: "Under 200",
  "200_400": "200–400",
  "400_700": "400–700",
  "700_1000": "700–1000",
},
budgetHint: "Set a spend range in MDL — or tap a preset.",
budgetAny: "Any budget",
budgetReadout: "{min} – {max} MDL",
```

RU:

```ts
budgetPresets: {
  under200: "До 200",
  "200_400": "200–400",
  "400_700": "400–700",
  "700_1000": "700–1000",
},
budgetHint: "Задайте диапазон в леях (MDL) — или выберите пресет.",
budgetAny: "Любой бюджет",
budgetReadout: "{min} – {max} MDL",
```

RO:

```ts
budgetPresets: {
  under200: "Până la 200",
  "200_400": "200–400",
  "400_700": "400–700",
  "700_1000": "700–1000",
},
budgetHint: "Setează un interval în MDL — sau alege un preset.",
budgetAny: "Orice buget",
budgetReadout: "{min} – {max} MDL",
```

Keep TypeScript happy: all three locale objects must share the same keys (mirror structure exactly).

- [ ] **Step 2: Typecheck / quick grep**

```bash
cd seatiko/apps/web && npx tsc --noEmit 2>&1 | head -40
```

Fix any remaining `budget1` references (should be gone after Task 4).

- [ ] **Step 3: Commit**

```bash
git add seatiko/apps/web/src/lib/site-copy.ts
git commit -m "$(cat <<'EOF'
feat(web): add MDL budget and preset copy

EOF
)"
```

---

### Task 6: Preference stepper UI (tiles + MDL range)

**Files:**
- Modify: `seatiko/apps/web/src/components/discover/preference-stepper.tsx`

- [ ] **Step 1: Update imports and selectedCount**

Remove `budgetLevelsFromRange`, `budgetRangeFromLevels`, `BudgetLevel`, `BUDGET_LEVELS`.

Add:

```ts
import {
  BUDGET_MDL_MAX,
  BUDGET_MDL_MIN,
  BUDGET_MDL_STEP,
  BUDGET_PRESET_IDS,
  budgetPresetRange,
  matchBudgetPreset,
  normalizeBudgetRange,
  type BudgetMdlRange,
  type BudgetPresetId,
  // existing chip constants…
} from "@/lib/discover-preferences";
import { chipIcon } from "@/lib/discover-chip-icons";
import { fillTemplate } from "@/lib/soft-advance";
```

```ts
case "budget":
  return prefs.budget ? 1 : 0;
```

- [ ] **Step 2: Replace budget UI block**

Use one visual dual-thumb control via two overlapped `<input type="range">` elements (native single-thumb limitation):

```tsx
{step === "budget" ? (
  <div className="discover-budget">
    <div className="discover-budget-range" role="group" aria-label={copy.steps.budget}>
      <input
        type="range"
        className="discover-budget-thumb discover-budget-thumb-min"
        min={BUDGET_MDL_MIN}
        max={BUDGET_MDL_MAX}
        step={BUDGET_MDL_STEP}
        value={prefs.budget?.min ?? BUDGET_MDL_MIN}
        onChange={(e) => {
          const min = Number(e.target.value);
          const max = prefs.budget?.max ?? BUDGET_MDL_MAX;
          onPrefsChange({
            ...prefs,
            budget: normalizeBudgetRange({ min, max: Math.max(min, max) }),
          });
        }}
      />
      <input
        type="range"
        className="discover-budget-thumb discover-budget-thumb-max"
        min={BUDGET_MDL_MIN}
        max={BUDGET_MDL_MAX}
        step={BUDGET_MDL_STEP}
        value={prefs.budget?.max ?? BUDGET_MDL_MAX}
        onChange={(e) => {
          const max = Number(e.target.value);
          const min = prefs.budget?.min ?? BUDGET_MDL_MIN;
          onPrefsChange({
            ...prefs,
            budget: normalizeBudgetRange({ min: Math.min(min, max), max }),
          });
        }}
      />
    </div>
    <p className="discover-budget-value">
      {prefs.budget
        ? fillTemplate(copy.budgetReadout, {
            min: String(prefs.budget.min),
            max: String(prefs.budget.max),
          })
        : copy.budgetAny}
    </p>
    <div className="discover-chips discover-budget-presets" role="group">
      {BUDGET_PRESET_IDS.map((id) => {
        const on = matchBudgetPreset(prefs.budget) === id;
        return (
          <button
            key={id}
            type="button"
            className={`discover-chip ${on ? "on" : ""}`}
            aria-pressed={on}
            onClick={() =>
              onPrefsChange({
                ...prefs,
                budget: budgetPresetRange(id),
              })
            }
          >
            <span className="discover-chip-icon" aria-hidden>
              {chipIcon(id)}
            </span>
            <span>{copy.budgetPresets[id]}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={`discover-chip ${prefs.budget == null ? "on" : ""}`}
        aria-pressed={prefs.budget == null}
        onClick={() => onPrefsChange({ ...prefs, budget: null })}
      >
        <span className="discover-chip-icon" aria-hidden>
          {chipIcon("any")}
        </span>
        <span>{copy.budgetAny}</span>
      </button>
    </div>
  </div>
) : (
  // chips…
)}
```

- [ ] **Step 3: Tile markup for non-budget chips**

For each chip button (primary + more):

```tsx
<button
  key={chip.id}
  type="button"
  className={`discover-chip ${chip.selected ? "on" : ""}`}
  aria-pressed={chip.selected}
  onClick={() => toggle(chip.id)}
>
  <span className="discover-chip-icon" aria-hidden>
    {chipIcon(chip.id)}
  </span>
  <span className="discover-chip-label">{chip.label}</span>
  {chip.selected ? (
    <span className="discover-stepper-check" aria-hidden>
      ✓
    </span>
  ) : null}
</button>
```

Wrap body options in:

```tsx
<div className="discover-stepper-panel">
  {/* hint already above; chips or budget inside */}
</div>
```

Structure:

```tsx
<div className="discover-stepper-body">
  <h2>…</h2>
  <p className="discover-stepper-hint">…</p>
  <div className="discover-stepper-panel">
    {/* budget OR chips + show more */}
  </div>
</div>
```

- [ ] **Step 4: Smoke typecheck**

```bash
cd seatiko/apps/web && npx tsc --noEmit 2>&1 | head -50
```

Fix remaining `budget.length` / `BudgetLevel[]` call sites if any.

- [ ] **Step 5: Commit**

```bash
git add seatiko/apps/web/src/components/discover/preference-stepper.tsx
git commit -m "$(cat <<'EOF'
feat(web): tile chips and MDL budget range in discover stepper

EOF
)"
```

---

### Task 7: CSS — density, tiles, dual-range, drop min-height

**Files:**
- Modify: `seatiko/apps/web/src/app/premium.css`

- [ ] **Step 1: Drop stepper min-height and add panel/grid/tile styles**

In `.discover-stepper` (around line 1753), **remove** `min-height: 560px;` (do **not** change `.venue-map-shell` / `.venue-map-canvas` min-heights).

Add/replace chip + budget CSS:

```css
.discover-stepper-panel {
  padding: 1rem 1rem 1.1rem;
  border: 1px solid var(--fa-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--fa-bg) 45%, var(--fa-surface));
}

.discover-chips {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.discover-chips-more {
  margin-top: 0.65rem;
}

.discover-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.35rem;
  min-height: 4.25rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--fa-border);
  border-radius: 14px;
  color: var(--fa-text);
  background: color-mix(in srgb, var(--fa-surface) 80%, transparent);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s;
}

.discover-chip-icon {
  font-size: 1.15rem;
  line-height: 1;
}

.discover-chip-label {
  line-height: 1.25;
}

.discover-chip:hover {
  border-color: color-mix(in srgb, var(--fa-gold) 55%, transparent);
  background: color-mix(in oklab, var(--fa-gold) 10%, transparent);
}

.discover-chip:active {
  transform: scale(0.98);
}

.discover-chip.on {
  background: var(--fa-gold);
  border-color: var(--fa-gold);
  color: #1a1510;
}

.discover-budget-presets {
  margin-top: 0.35rem;
}

.discover-budget-range {
  position: relative;
  height: 2rem;
  margin: 0.35rem 0 0.5rem;
}

.discover-budget-thumb {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  margin: 0;
  pointer-events: none;
  appearance: none;
  background: transparent;
  accent-color: var(--fa-gold);
}

.discover-budget-thumb::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fa-border) 80%, transparent);
}

.discover-budget-thumb::-webkit-slider-thumb {
  pointer-events: auto;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--fa-gold);
  border: 2px solid color-mix(in srgb, var(--fa-surface) 40%, #1a1510);
  cursor: pointer;
}

.discover-budget-thumb::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fa-border) 80%, transparent);
}

.discover-budget-thumb::-moz-range-thumb {
  pointer-events: auto;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--fa-gold);
  border: 2px solid #1a1510;
  cursor: pointer;
}

.discover-budget-thumb-max {
  z-index: 2;
}

@media (max-width: 640px) {
  .discover-chips {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

Remove obsolete pill-oriented rules that conflict (old `.discover-chip { display: inline-flex; … border-radius: 999px; }` block around ~1935). Replace rather than duplicate.

Also remove/simplify old `.discover-budget-sliders` / dual-label grid if unused; keep `.discover-budget-value` styling.

Optional: `.discover-stepper-body { animation: discover-step-fade 0.18s ease; }` with `@keyframes discover-step-fade` opacity 0.65→1 (light motion from spec).

- [ ] **Step 2: Commit**

```bash
git add seatiko/apps/web/src/app/premium.css
git commit -m "$(cat <<'EOF'
style(web): densify discover tiles and MDL range UI

EOF
)"
```

---

### Task 8: Full test suite + Docker rebuild

**Files:** none new

- [ ] **Step 1: Run web unit tests**

```bash
cd seatiko/apps/web && npx vitest run src/lib/discover-preferences.test.ts src/lib/discover-chip-icons.test.ts src/lib/guided-chat-script.test.ts src/lib/soft-advance.test.ts
```

Expected: all PASS

- [ ] **Step 2: Rebuild web image from this worktree**

```bash
cd /path/to/.worktrees/discover-preference-box-polish && \
docker build --no-cache -t seatiko-web:latest --build-arg NEXT_PUBLIC_API_URL= seatiko/apps/web && \
cd /path/to/repo-root && docker compose up -d --force-recreate web
```

Verify markers:

```bash
docker exec seatiko-web-1 sh -c \
  'grep -Roh "discover-stepper-panel\|budgetReadout\|discover-budget-range\|discover-chip-icon" /app/.next/static 2>/dev/null | sort | uniq -c'
```

Expected: non-zero hits for panel / budget-range / chip-icon.

- [ ] **Step 3: Manual checklist**

- [ ] `/discover` card no longer has huge empty void
- [ ] Cuisine shows 8 tiles; Show more reveals rest
- [ ] Mobile: 2-column tiles
- [ ] Budget: dual thumbs 50–1000 MDL; presets snap; Any clears
- [ ] Light/Dark theme still coherent
- [ ] Soft auto-advance still works on non-budget steps

- [ ] **Step 4: Final commit only if leftover fixes** (otherwise done)

---

## Spec coverage self-review

| Spec item | Task |
|---|---|
| Drop min-height 560 on stepper | Task 7 |
| Inner panel behind options | Task 6 + 7 |
| Tile grid 3/2 cols | Task 6 + 7 |
| Primary counts 8/6/6/6 | Task 2 |
| Show more retained | Task 6 (existing) |
| MDL dual-thumb 50–1000 step 50 | Task 1 + 6 + 7 |
| Presets + Any | Task 1 + 5 + 6 |
| Soft map to price_level | Task 1 |
| URL `budget=min-max` | Task 1 |
| Icons on tiles | Task 3 + 6 |
| EN/RU/RO copy | Task 5 |
| Guided chat budget | Task 4 |
| Motion (chip press + light fade) | Task 7 |
| Docker rebuild note | Task 8 |
| Out of scope (chat rewrite, map, Flutter, real MDL API) | respected |

## Placeholder / consistency check

- Types: `BudgetMdlRange | null`, preset ids `under200` | `200_400` | `400_700` | `700_1000` | `any` — used consistently across tasks.
- No TBD / “add tests later” steps.
- Dual-thumb implemented as two overlapped range inputs (documented) — still one visual range.
