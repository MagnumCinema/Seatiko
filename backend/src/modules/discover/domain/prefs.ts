// /discover preferences and the "Найдено: N" counter, ported from internal/discover
// (prefs.go). Mirrors apps/web/src/lib/discover-preferences.ts: change both together.
import type { LocalizedString } from '../../../database/schema/columns.js';

export const CUISINE_IDS = ['moldovan', 'italian', 'asian', 'european', 'japanese', 'chinese', 'mexican', 'seafood', 'vegetarian', 'grill', 'fast_food', 'cafe_sweets'];
export const TYPE_IDS = ['restaurant', 'cafe', 'bar', 'fast_food', 'fine_dining', 'pub', 'pizzeria', 'bakery', 'wine_bar'];
export const OCCASION_IDS = ['quick_lunch', 'date_night', 'family', 'business', 'group', 'brunch', 'celebration', 'solo'];
export const PRACTICAL_IDS = ['open_now', 'free_tables', 'partners', 'nearby', 'outdoor', 'parking', 'wifi', 'kid_friendly'];

const BUDGET_MIN = 50;
const BUDGET_MAX = 1000;
const BUDGET_STEP = 50;
/** RankOptions.nearbyRadiusKm on the web. */
export const NEARBY_RADIUS_KM = 3;

export type Budget = { min: number; max: number };
export type Prefs = { cuisine: string[]; restaurant_type: string[]; budget?: Budget; occasion: string[]; practical: string[] };
export type Origin = { lat: number; lng: number };

/** The fields of a map place the filters look at. */
export type FilterablePlace = {
  name: LocalizedString;
  lat: number;
  lng: number;
  in_database: boolean;
  open_now?: boolean;
  free_tables: number;
  cuisine?: string[];
  price_level?: number;
};

export type FilterCounts = { total: number; matched: number; relax?: { filter: string; matched: number } };

function parseList(raw: string | undefined, ids: string[]): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(',')) {
    const id = part.trim().toLowerCase();
    if (ids.includes(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function snap(n: number, ceil: boolean): number {
  const v = Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, n));
  let steps = Math.floor(v / BUDGET_STEP);
  if (ceil && v % BUDGET_STEP !== 0) steps++;
  return steps * BUDGET_STEP;
}

/** Clamp to 50–1000 MDL, snap to 50, order. */
export function normalizeBudget(b: Budget): Budget {
  let lo = snap(b.min, false);
  let hi = snap(b.max, true);
  if (lo > hi) [lo, hi] = [snap(b.max, false), snap(b.min, true)];
  return { min: lo, max: hi };
}

/** Query params cuisine, type, budget, occasion, practical (as encodePreferences on the web). */
export function parsePrefs(q: Record<string, unknown>): Prefs {
  const one = (k: string) => {
    const v = q[k];
    return typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : undefined;
  };
  const prefs: Prefs = {
    cuisine: parseList(one('cuisine'), CUISINE_IDS),
    restaurant_type: parseList(one('type'), TYPE_IDS),
    occasion: parseList(one('occasion'), OCCASION_IDS),
    practical: parseList(one('practical'), PRACTICAL_IDS),
  };
  const m = /^(\d+)\s*-\s*(\d+)$/.exec((one('budget') ?? '').trim());
  if (m) prefs.budget = normalizeBudget({ min: Number(m[1]), max: Number(m[2]) });
  return prefs;
}

export const prefsEmpty = (p: Prefs) => !p.cuisine.length && !p.restaurant_type.length && !p.budget && !p.occasion.length && !p.practical.length;

/** Overlapping soft MDL bands → price levels (priceLevelsForMdlRange). */
export function priceLevels(b?: Budget): number[] {
  if (!b) return [];
  const n = normalizeBudget(b);
  const levels: number[] = [];
  if (n.max >= 50 && n.min <= 250) levels.push(1);
  if (n.max > 200 && n.min <= 550) levels.push(2);
  if (n.max >= 500 && n.min <= 1000) levels.push(3);
  return levels;
}

const CUISINE_ALIASES: Record<string, string[]> = {
  moldovan: ['moldovan', 'молдав', 'moldoven'],
  italian: ['italian', 'итальян', 'pizza', 'pasta'],
  asian: ['asian', 'азиат', 'thai', 'korean', 'vietnamese'],
  european: ['european', 'европ', 'french', 'german'],
  japanese: ['japanese', 'япон', 'sushi', 'ramen'],
  chinese: ['chinese', 'китай'],
  mexican: ['mexican', 'мексик', 'taco'],
  seafood: ['seafood', 'морепрод', 'fish', 'рыба'],
  vegetarian: ['vegetarian', 'vegan', 'вегетар', 'plant'],
  grill: ['grill', 'bbq', 'steak', 'гриль', 'шашлык'],
  fast_food: ['fast food', 'fast_food', 'burger', 'street'],
  cafe_sweets: ['cafe', 'coffee', 'dessert', 'sweet', 'кондитер', 'кофе'],
};

function cuisineMatches(p: FilterablePlace, ids: string[]): boolean {
  if (!ids.length) return true;
  const text = [p.name.ru, p.name.en, p.name.ro, ...(p.cuisine ?? [])].join(' ').toLowerCase();
  return ids.some((id) => (CUISINE_ALIASES[id] ?? []).some((a) => text.includes(a)));
}

function budgetMatches(p: FilterablePlace, b?: Budget): boolean {
  const levels = priceLevels(b);
  // Unknown price is not a mismatch.
  return !levels.length || !p.price_level || levels.includes(p.price_level);
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

/** Hard filters: cuisine, budget and practical; type and occasion only rank. */
export function matches(p: FilterablePlace, prefs: Prefs, origin?: Origin): boolean {
  if (!cuisineMatches(p, prefs.cuisine) || !budgetMatches(p, prefs.budget)) return false;
  for (const f of prefs.practical) {
    if (f === 'partners' && !p.in_database) return false;
    if (f === 'open_now' && !p.open_now) return false;
    if (f === 'free_tables' && p.free_tables <= 0) return false;
    if (f === 'nearby' && origin && haversineKm(origin.lat, origin.lng, p.lat, p.lng) > NEARBY_RADIUS_KM) return false;
  }
  return true;
}

const countMatches = (places: FilterablePlace[], prefs: Prefs, origin?: Origin) => places.filter((p) => matches(p, prefs, origin)).length;

/** Places in the area, how many pass, and (at 0) which single filter to loosen. */
export function countFilters(places: FilterablePlace[], prefs: Prefs, origin?: Origin): FilterCounts {
  const c: FilterCounts = { total: places.length, matched: countMatches(places, prefs, origin) };
  if (c.matched > 0 || c.total === 0) return c;
  const attempt = (filter: string, without: Prefs) => {
    const n = countMatches(places, without, origin);
    if (n > 0 && (!c.relax || n > c.relax.matched)) c.relax = { filter, matched: n };
  };
  if (prefs.cuisine.length) attempt('cuisine', { ...prefs, cuisine: [] });
  if (prefs.budget) attempt('budget', { ...prefs, budget: undefined });
  for (const f of prefs.practical) attempt(f, { ...prefs, practical: prefs.practical.filter((o) => o !== f) });
  return c;
}
