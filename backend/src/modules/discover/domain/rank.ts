// Recommendation ranking, ported from internal/discover/rank.go (scorePlace on the web).
import { budgetMatches, cuisineMatches, type FilterablePlace, matches, type Origin, type Prefs, priceLevels } from './prefs.js';

export type RankPlace = FilterablePlace & { id: string; venue_id?: string; rating?: number };
export type RankedVenue = { venue_id: string; score: number; reasons: string[] };

const TYPE_ALIASES: Record<string, string[]> = {
  restaurant: ['restaurant', 'ресторан'], cafe: ['cafe', 'coffee', 'кафе', 'кофе'], bar: ['bar', 'бар'],
  fast_food: ['fast', 'burger', 'street'], fine_dining: ['fine', 'gourmet', 'мишлен'], pub: ['pub', 'паб', 'beer'],
  pizzeria: ['pizza', 'pizzeria', 'пицц'], bakery: ['bakery', 'пекар', 'bread', 'pastry'], wine_bar: ['wine', 'вино', 'enoteca'],
};

const placeText = (p: RankPlace) => [p.name.ru, p.name.en, p.name.ro, ...(p.cuisine ?? [])].join(' ').toLowerCase();

function occasionFits(p: RankPlace, occasion: string): boolean {
  const text = placeText(p);
  const price = p.price_level ?? 0;
  switch (occasion) {
    case 'quick_lunch':
      return price <= 2 || text.includes('cafe') || text.includes('fast');
    case 'date_night':
    case 'celebration':
      return price >= 2 || text.includes('wine') || text.includes('fine');
    case 'family':
      return p.in_database || text.includes('family');
    case 'business':
      return price >= 2;
    case 'group':
      return p.free_tables >= 2;
    case 'brunch':
      return text.includes('brunch') || text.includes('cafe') || text.includes('breakfast');
    case 'solo':
      return price <= 2 || text.includes('cafe') || text.includes('bar');
  }
  return false;
}

/** Hard filters then score; when nothing passes, everything is ranked (exact=false). */
export function rank(places: RankPlace[], prefs: Prefs, origin: Origin | undefined, limit: number): { ranked: RankedVenue[]; exact: boolean } {
  const passing = places.filter((p) => matches(p, prefs, origin));
  const exact = passing.length > 0;
  const ranked = (exact ? passing : places).map((p) => {
    const r: RankedVenue = { venue_id: p.venue_id || p.id, score: 0, reasons: [] };
    const add = (points: number, reason: string) => {
      r.score += points;
      r.reasons.push(reason);
    };
    if (prefs.cuisine.length && cuisineMatches(p, prefs.cuisine)) add(40, 'cuisine');
    if (priceLevels(prefs.budget).length && (p.price_level ?? 0) > 0 && budgetMatches(p, prefs.budget)) add(30, 'budget');
    if (prefs.restaurant_type.length && prefs.restaurant_type.some((t) => (TYPE_ALIASES[t] ?? []).some((a) => placeText(p).includes(a)))) add(20, 'type');
    for (const o of prefs.occasion) if (occasionFits(p, o)) add(7, `occasion:${o}`);
    for (const f of prefs.practical) {
      if ((f === 'open_now' && p.open_now) || (f === 'free_tables' && p.free_tables > 0) || (f === 'partners' && p.in_database)) add(12, f);
    }
    if (p.in_database) r.score += 5;
    r.score += (p.rating ?? 0) * 2;
    return r;
  });
  ranked.sort((a, b) => b.score - a.score || (a.venue_id < b.venue_id ? -1 : a.venue_id > b.venue_id ? 1 : 0));
  return { ranked: limit > 0 ? ranked.slice(0, limit) : ranked, exact };
}
