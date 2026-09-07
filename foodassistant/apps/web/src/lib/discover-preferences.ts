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
