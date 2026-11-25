import type { MapPlace } from "@/lib/api";

export type CuisineId =
  | "moldovan"
  | "italian"
  | "asian"
  | "european"
  | "japanese"
  | "chinese"
  | "mexican"
  | "seafood"
  | "vegetarian"
  | "grill"
  | "fast_food"
  | "cafe_sweets";

export type RestaurantTypeId =
  | "restaurant"
  | "cafe"
  | "bar"
  | "fast_food"
  | "fine_dining"
  | "pub"
  | "pizzeria"
  | "bakery"
  | "wine_bar";

export type OccasionId =
  | "quick_lunch"
  | "date_night"
  | "family"
  | "business"
  | "group"
  | "brunch"
  | "celebration"
  | "solo";

export type PracticalId =
  | "open_now"
  | "free_tables"
  | "partners"
  | "nearby"
  | "outdoor"
  | "parking"
  | "wifi"
  | "kid_friendly";

export type BudgetLevel = 1 | 2 | 3;

export type BudgetMdlRange = { min: number; max: number };

export type BudgetCurrencyId = "MDL" | "EUR" | "USD" | "RON";

export type BudgetPresetId =
  | "under200"
  | "200_400"
  | "400_700"
  | "700_1000"
  | "any";

export const BUDGET_MDL_MIN = 50;
export const BUDGET_MDL_MAX = 1000;
export const BUDGET_MDL_STEP = 50;

export const BUDGET_CURRENCY_IDS: BudgetCurrencyId[] = [
  "MDL",
  "EUR",
  "USD",
  "RON",
];

/** Approximate units of MDL per 1 unit of currency (display conversion only). */
export const MDL_PER_CURRENCY: Record<BudgetCurrencyId, number> = {
  MDL: 1,
  EUR: 20,
  USD: 18,
  RON: 4,
};

export function isBudgetCurrencyId(id: string): id is BudgetCurrencyId {
  return (BUDGET_CURRENCY_IDS as readonly string[]).includes(id);
}

export function mdlToDisplay(
  mdl: number,
  currency: BudgetCurrencyId,
): number {
  const rate = MDL_PER_CURRENCY[currency];
  if (rate === 1) return mdl;
  return Math.max(1, Math.round(mdl / rate));
}

export function formatBudgetAmount(
  mdl: number,
  currency: BudgetCurrencyId,
): string {
  return String(mdlToDisplay(mdl, currency));
}

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
  /** Display currency for budget UI; filtering still uses MDL range. */
  budgetCurrency: BudgetCurrencyId;
  occasion: OccasionId[];
  practical: PracticalId[];
};

/** First-row chips shown before “Show more”. */
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
export const CUISINE_IDS: CuisineId[] = [...CUISINE_PRIMARY, ...CUISINE_MORE];

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
export const RESTAURANT_TYPE_IDS: RestaurantTypeId[] = [
  ...RESTAURANT_TYPE_PRIMARY,
  ...RESTAURANT_TYPE_MORE,
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
export const OCCASION_IDS: OccasionId[] = [
  ...OCCASION_PRIMARY,
  ...OCCASION_MORE,
];

export const PRACTICAL_PRIMARY: PracticalId[] = [
  "open_now",
  "free_tables",
  "nearby",
  "partners",
  "outdoor",
  "parking",
];
export const PRACTICAL_MORE: PracticalId[] = ["wifi", "kid_friendly"];
export const PRACTICAL_IDS: PracticalId[] = [
  ...PRACTICAL_PRIMARY,
  ...PRACTICAL_MORE,
];

const CUISINE_SET = new Set<string>(CUISINE_IDS);
const TYPE_SET = new Set<string>(RESTAURANT_TYPE_IDS);
const OCCASION_SET = new Set<string>(OCCASION_IDS);
const PRACTICAL_SET = new Set<string>(PRACTICAL_IDS);

export function emptyPreferences(): DiscoverPreferences {
  return {
    cuisine: [],
    restaurantType: [],
    budget: null,
    budgetCurrency: "MDL",
    occasion: [],
    practical: [],
  };
}

export function hasAnyPreference(prefs: DiscoverPreferences): boolean {
  return (
    prefs.cuisine.length > 0 ||
    prefs.restaurantType.length > 0 ||
    prefs.budget != null ||
    prefs.occasion.length > 0 ||
    prefs.practical.length > 0
  );
}

function snapMdl(n: number, mode: "floor" | "ceil"): number {
  const clamped = Math.min(BUDGET_MDL_MAX, Math.max(BUDGET_MDL_MIN, n));
  const div = clamped / BUDGET_MDL_STEP;
  const steps =
    mode === "floor" ? Math.floor(div) : Math.ceil(div);
  return steps * BUDGET_MDL_STEP;
}

export function normalizeBudgetRange(range: BudgetMdlRange): BudgetMdlRange {
  let min = snapMdl(range.min, "floor");
  let max = snapMdl(range.max, "ceil");
  if (min > max) {
    min = snapMdl(range.max, "floor");
    max = snapMdl(range.min, "ceil");
  }
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
  // Exclusive at 200 so under200 preset ({50,200}) maps to level 1 only.
  if (max > 200 && min <= 550) levels.push(2);
  if (max >= 500 && min <= 1000) levels.push(3);
  return levels;
}

/** Max-only budget: floor is always BUDGET_MDL_MIN. */
export function budgetPresetRange(
  id: BudgetPresetId,
): BudgetMdlRange | null {
  if (id === "any") return null;
  return {
    min: BUDGET_MDL_MIN,
    max: BUDGET_PRESET_RANGES[id].max,
  };
}

export function matchBudgetPreset(
  range: BudgetMdlRange | null,
): BudgetPresetId | null {
  if (!range) return "any";
  const n = normalizeBudgetRange(range);
  if (n.min !== BUDGET_MDL_MIN) return null;
  for (const id of BUDGET_PRESET_IDS) {
    if (BUDGET_PRESET_RANGES[id].max === n.max) return id;
  }
  return null;
}

export function budgetMaxOnly(max: number): BudgetMdlRange {
  return normalizeBudgetRange({ min: BUDGET_MDL_MIN, max });
}

function parseBudgetParam(raw: string | null): BudgetMdlRange | null {
  if (!raw) return null;
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(raw.trim());
  if (!m) return null;
  return normalizeBudgetRange({ min: Number(m[1]), max: Number(m[2]) });
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
  if (prefs.budget) {
    params.set("budget", `${prefs.budget.min}-${prefs.budget.max}`);
  }
  if (prefs.budgetCurrency && prefs.budgetCurrency !== "MDL") {
    params.set("currency", prefs.budgetCurrency);
  }
  if (prefs.occasion.length) params.set("occasion", prefs.occasion.join(","));
  if (prefs.practical.length) {
    params.set("practical", prefs.practical.join(","));
  }
  return params.toString();
}

export function decodePreferences(search: string): DiscoverPreferences {
  const qs = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(qs);
  const budget = parseBudgetParam(params.get("budget"));
  const currencyRaw = (params.get("currency") ?? "MDL").toUpperCase();
  const budgetCurrency = isBudgetCurrencyId(currencyRaw)
    ? currencyRaw
    : "MDL";

  return {
    cuisine: parseList(params.get("cuisine")).filter((id): id is CuisineId =>
      CUISINE_SET.has(id),
    ),
    restaurantType: parseList(params.get("type")).filter(
      (id): id is RestaurantTypeId => TYPE_SET.has(id),
    ),
    budget,
    budgetCurrency,
    occasion: parseList(params.get("occasion")).filter(
      (id): id is OccasionId => OCCASION_SET.has(id),
    ),
    practical: parseList(params.get("practical")).filter(
      (id): id is PracticalId => PRACTICAL_SET.has(id),
    ),
  };
}

export function toggleId<T extends string | number>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export type RankOptions = {
  userLat?: number;
  userLng?: number;
  nearbyRadiusKm?: number;
};

export type ScoredPlace = {
  place: MapPlace;
  score: number;
};

const CUISINE_ALIASES: Record<CuisineId, string[]> = {
  moldovan: ["moldovan", "молдав", "moldoven"],
  italian: ["italian", "итальян", "pizza", "pasta"],
  asian: ["asian", "азиат", "thai", "korean", "vietnamese"],
  european: ["european", "европ", "french", "german"],
  japanese: ["japanese", "япон", "sushi", "ramen"],
  chinese: ["chinese", "китай"],
  mexican: ["mexican", "мексик", "taco"],
  seafood: ["seafood", "морепрод", "fish", "рыба"],
  vegetarian: ["vegetarian", "vegan", "вегетар", "plant"],
  grill: ["grill", "bbq", "steak", "гриль", "шашлык"],
  fast_food: ["fast food", "fast_food", "burger", "street"],
  cafe_sweets: ["cafe", "coffee", "dessert", "sweet", "кондитер", "кофе"],
};

const TYPE_ALIASES: Record<RestaurantTypeId, string[]> = {
  restaurant: ["restaurant", "ресторан"],
  cafe: ["cafe", "coffee", "кафе", "кофе"],
  bar: ["bar", "бар"],
  fast_food: ["fast", "burger", "street"],
  fine_dining: ["fine", "gourmet", "мишлен"],
  pub: ["pub", "паб", "beer"],
  pizzeria: ["pizza", "pizzeria", "пицц"],
  bakery: ["bakery", "пекар", "bread", "pastry"],
  wine_bar: ["wine", "вино", "enoteca"],
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

function budgetMatches(place: MapPlace, range: BudgetMdlRange | null): boolean {
  const levels = priceLevelsForMdlRange(range);
  if (!levels.length) return true;
  // Missing price_level: do not hard-exclude (unknown ≠ mismatch).
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
  // Restaurant type is soft in v1 — MapPlace signals are weak; scoring only.
  if (!budgetMatches(place, prefs.budget)) return false;

  for (const p of prefs.practical) {
    if (p === "partners" && !place.in_database) return false;
    if (p === "open_now" && place.open_now !== true) return false;
    if (
      p === "free_tables" &&
      !(typeof place.free_tables === "number" && place.free_tables > 0)
    ) {
      return false;
    }
    if (p === "nearby") {
      if (opts?.userLat == null || opts?.userLng == null) continue;
      const radius = opts.nearbyRadiusKm ?? 3;
      if (
        haversineKm(opts.userLat, opts.userLng, place.lat, place.lng) > radius
      ) {
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
    if (
      o === "quick_lunch" &&
      (price <= 2 || text.includes("cafe") || text.includes("fast"))
    ) {
      bonus += 8;
    }
    if (
      o === "date_night" &&
      (price >= 2 || text.includes("wine") || text.includes("fine"))
    ) {
      bonus += 8;
    }
    if (o === "family" && (place.in_database || text.includes("family")))
      bonus += 6;
    if (o === "business" && price >= 2) bonus += 6;
    if (o === "group" && (place.free_tables ?? 0) >= 2) bonus += 6;
    if (
      o === "brunch" &&
      (text.includes("brunch") || text.includes("cafe") || text.includes("breakfast"))
    ) {
      bonus += 7;
    }
    if (
      o === "celebration" &&
      (price >= 2 || text.includes("party") || text.includes("event"))
    ) {
      bonus += 7;
    }
    if (o === "solo" && (price <= 2 || text.includes("cafe") || text.includes("bar"))) {
      bonus += 6;
    }
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
  if (budgetScoreMatches(place, prefs.budget)) score += 30;
  if (prefs.restaurantType.length && typeMatches(place, prefs.restaurantType)) {
    score += 20;
  }
  if (prefs.practical.includes("partners") && place.in_database) score += 15;
  if (prefs.practical.includes("open_now") && place.open_now === true)
    score += 12;
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
  const softText = placeText(place);
  if (prefs.practical.includes("outdoor") && softText.includes("terrace"))
    score += 8;
  if (prefs.practical.includes("parking") && softText.includes("park")) score += 6;
  if (prefs.practical.includes("wifi") && softText.includes("wifi")) score += 6;
  if (
    prefs.practical.includes("kid_friendly") &&
    (softText.includes("family") || softText.includes("kid"))
  ) {
    score += 6;
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

/** Drops one filter by the server's relax hint ("cuisine", "budget" or a practical id). */
export function relaxPreference(prefs: DiscoverPreferences, filter: string): DiscoverPreferences {
  if (filter === "cuisine") return { ...prefs, cuisine: [] };
  if (filter === "budget") return { ...prefs, budget: null };
  return { ...prefs, practical: prefs.practical.filter((id) => id !== filter) };
}
