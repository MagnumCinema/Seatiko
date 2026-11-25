import type { PlaceCategory, SourcePlace } from '../../modules/open-places/domain/merge.js';

/** One element of an Overpass `out center tags` answer. */
export type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const AMENITY: Record<string, PlaceCategory> = {
  restaurant: 'restaurant', cafe: 'cafe', bar: 'bar', pub: 'pub', fast_food: 'fast_food', ice_cream: 'ice_cream',
};
const SHOP: Record<string, PlaceCategory> = { bakery: 'bakery', pastry: 'bakery', coffee: 'coffee_shop' };

const clean = (v: string | undefined) => (v ?? '').trim();

/** Overpass query: named food places inside the bounds. */
export function overpassQuery(b: { south: number; west: number; north: number; east: number }): string {
  const box = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:180];
(
  nwr["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream)$"]["name"](${box});
  nwr["shop"~"^(bakery|pastry|coffee)$"]["name"](${box});
);
out center tags;`;
}

/** Maps an OSM element to our fields; undefined when it is not a usable food place. */
export function fromOsm(el: OverpassElement): SourcePlace | undefined {
  const tags = el.tags ?? {};
  const category = AMENITY[tags.amenity] ?? SHOP[tags.shop];
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const name = clean(tags.name);
  if (!category || lat === undefined || lng === undefined || !name) return undefined;
  if (tags['disused:amenity'] || tags.opening_hours === 'closed') return undefined;

  const street = [clean(tags['addr:street']), clean(tags['addr:housenumber'])].filter(Boolean).join(' ');
  const address = [street, clean(tags['addr:city'])].filter(Boolean).join(', ');
  const ru = clean(tags['name:ru']) || name;
  const ro = clean(tags['name:ro']) || name;
  return {
    source: 'osm',
    sourceId: `${el.type[0]}${el.id}`,
    name: { ru, ro, en: clean(tags['name:en']) || ro },
    lat,
    lng,
    address: { ru: address, ro: address, en: address },
    category,
    cuisine: clean(tags.cuisine).split(/[;,]/).map((c) => c.trim().toLowerCase()).filter(Boolean),
    openingHours: clean(tags.opening_hours),
    phone: clean(tags.phone || tags['contact:phone']).split(';')[0].trim(),
    website: clean(tags.website || tags['contact:website']),
    confidence: 1,
  };
}
