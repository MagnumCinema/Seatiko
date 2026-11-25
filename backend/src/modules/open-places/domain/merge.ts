import type { LocalizedString } from '../../../database/schema/columns.js';
import { distanceM, nameSimilarity, samePlace } from './name-match.js';

export type PlaceCategory = 'restaurant' | 'cafe' | 'coffee_shop' | 'bar' | 'pub' | 'fast_food' | 'bakery' | 'ice_cream';

/** One record from one dataset, already mapped to our fields. */
export type SourcePlace = {
  source: 'osm' | 'overture';
  /** Dataset id: "n123" / "w45" for OSM, the GERS id for Overture. */
  sourceId: string;
  name: LocalizedString;
  lat: number;
  lng: number;
  address: LocalizedString;
  category: PlaceCategory;
  cuisine: string[];
  openingHours: string;
  phone: string;
  website: string;
  /** Overture confidence; 1 for OSM (surveyed by people). */
  confidence: number;
};

export type MergedPlace = Omit<SourcePlace, 'source' | 'sourceId'> & {
  id: string;
  osmId: string | null;
  overtureId: string | null;
  sources: Array<'osm' | 'overture'>;
};

const anyName = (n: LocalizedString) => n.ro || n.en || n.ru;
const filled = (n: LocalizedString) => Boolean(n.ru || n.ro || n.en);

/** Spatial hash with ~220 m cells: candidates for a point are in its cell and the 8 around it. */
class Grid<T extends { lat: number; lng: number }> {
  private readonly cells = new Map<string, T[]>();
  private static readonly STEP = 0.002;

  private key(lat: number, lng: number, dy = 0, dx = 0): string {
    return `${Math.floor(lat / Grid.STEP) + dy}:${Math.floor(lng / Grid.STEP) + dx}`;
  }

  add(item: T): void {
    const k = this.key(item.lat, item.lng);
    const cell = this.cells.get(k);
    if (cell) cell.push(item);
    else this.cells.set(k, [item]);
  }

  near(lat: number, lng: number): T[] {
    const out: T[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(...(this.cells.get(this.key(lat, lng, dy, dx)) ?? []));
    return out;
  }
}

/** Best unused match for `place` among `candidates` (most similar name, then nearest). */
function bestMatch<T extends SourcePlace>(place: SourcePlace, candidates: T[], used: Set<T>): T | undefined {
  let best: T | undefined;
  let bestScore = -1;
  for (const c of candidates) {
    if (used.has(c) || !samePlace({ ...place, name: anyName(place.name) }, { ...c, name: anyName(c.name) })) continue;
    const score = nameSimilarity(anyName(place.name), anyName(c.name)) - distanceM(place.lat, place.lng, c.lat, c.lng) / 1000;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** Overture lists some places twice (from different providers): keep the most confident. */
export function dedupe(places: SourcePlace[]): SourcePlace[] {
  const grid = new Grid<SourcePlace>();
  const kept: SourcePlace[] = [];
  for (const p of [...places].sort((a, b) => b.confidence - a.confidence)) {
    if (grid.near(p.lat, p.lng).some((k) => samePlace({ ...p, name: anyName(p.name) }, { ...k, name: anyName(k.name) }))) continue;
    grid.add(p);
    kept.push(p);
  }
  return kept;
}

function fromOne(p: SourcePlace): MergedPlace {
  const { source, sourceId, ...rest } = p;
  return {
    ...rest,
    id: `${source === 'osm' ? 'osm' : 'ovt'}:${sourceId}`,
    osmId: source === 'osm' ? sourceId : null,
    overtureId: source === 'overture' ? sourceId : null,
    sources: [source],
  };
}

/**
 * Joins OSM and Overture into one list, one row per real place. OSM wins for the
 * point, names, hours and cuisine (mapped by people on site); Overture fills the
 * phone, website and address OSM often lacks.
 */
export function mergePlaces(osm: SourcePlace[], overture: SourcePlace[]): MergedPlace[] {
  const grid = new Grid<SourcePlace>();
  const ovt = dedupe(overture);
  for (const p of ovt) grid.add(p);
  const used = new Set<SourcePlace>();
  const out: MergedPlace[] = [];

  for (const o of osm) {
    const match = bestMatch(o, grid.near(o.lat, o.lng), used);
    if (!match) {
      out.push(fromOne(o));
      continue;
    }
    used.add(match);
    out.push({
      ...fromOne(o),
      name: filled(o.name) ? o.name : match.name,
      address: o.address.ro || o.address.ru ? o.address : match.address,
      cuisine: o.cuisine.length ? o.cuisine : match.cuisine,
      phone: o.phone || match.phone,
      website: o.website || match.website,
      overtureId: match.sourceId,
      sources: ['osm', 'overture'],
    });
  }
  for (const p of ovt) if (!used.has(p)) out.push(fromOne(p));
  return out;
}

/** Partner venue each merged place belongs to (same spot, similar name in any language). */
export function linkVenues(
  places: MergedPlace[],
  venues: Array<{ id: string; name: LocalizedString; lat: number; lng: number }>,
): Map<string, string> {
  const grid = new Grid<MergedPlace>();
  for (const p of places) grid.add(p);
  const links = new Map<string, string>();
  for (const v of venues) {
    if (!v.lat && !v.lng) continue;
    for (const p of grid.near(v.lat, v.lng)) {
      if (links.has(p.id)) continue;
      const venueNames = [v.name.ru, v.name.ro, v.name.en].filter(Boolean);
      const placeNames = [p.name.ru, p.name.ro, p.name.en].filter(Boolean);
      const match = venueNames.some((vn) => placeNames.some((pn) => samePlace({ name: vn, lat: v.lat, lng: v.lng }, { name: pn, lat: p.lat, lng: p.lng })));
      if (match) links.set(p.id, v.id);
    }
  }
  return links;
}
