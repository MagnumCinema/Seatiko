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
