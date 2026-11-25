import type { PlaceCategory, SourcePlace } from '../../modules/open-places/domain/merge.js';

/** Overture basic_category → ours. Wineries and distilleries are not places to eat out. */
export const OVERTURE_CATEGORIES: Record<string, PlaceCategory> = {
  restaurant: 'restaurant',
  casual_eatery: 'restaurant',
  food_and_drink: 'restaurant',
  cafe: 'cafe',
  non_alcoholic_beverage_venue: 'cafe',
  smoothie_juice_bar: 'cafe',
  coffee_shop: 'coffee_shop',
  bar: 'bar',
  lounge: 'bar',
  alcoholic_beverage_venue: 'bar',
  brewery: 'pub',
  fast_food_restaurant: 'fast_food',
};

/** Row of the DuckDB query in OvertureClient. */
export type OvertureRow = {
  id: string;
  name: string | null;
  name_ru: string | null;
  name_ro: string | null;
  name_en: string | null;
  lat: number;
  lng: number;
  category: string;
  hierarchy: string[] | null;
  confidence: number;
  phone: string | null;
  website: string | null;
  street: string | null;
  locality: string | null;
};

/** Cuisine from the taxonomy path: [food_and_drink, restaurant, european_restaurant, italian_restaurant] → [european, italian]. */
export function cuisineFromHierarchy(hierarchy: string[] | null): string[] {
  return (hierarchy ?? [])
    .filter((h) => h.endsWith('_restaurant') && h !== 'fast_food_restaurant')
    .map((h) => h.slice(0, -'_restaurant'.length));
}

export function fromOverture(row: OvertureRow): SourcePlace | undefined {
  const category = OVERTURE_CATEGORIES[row.category];
  const name = (row.name ?? '').trim();
  if (!category || !name) return undefined;
  const ro = row.name_ro?.trim() || name;
  const address = [row.street?.trim(), row.locality?.trim()].filter(Boolean).join(', ');
  return {
    source: 'overture',
    sourceId: row.id,
    name: { ru: row.name_ru?.trim() || name, ro, en: row.name_en?.trim() || ro },
    lat: row.lat,
    lng: row.lng,
    address: { ru: address, ro: address, en: address },
    category,
    cuisine: cuisineFromHierarchy(row.hierarchy),
    openingHours: '',
    phone: row.phone?.trim() ?? '',
    website: row.website?.trim() ?? '',
    confidence: row.confidence,
  };
}
