// Map area and text search, as handlers/map_places.go.
import type { LocalizedString } from '../../../database/schema/columns.js';

export type Bounds = { south: number; west: number; north: number; east: number };

/** "south,west,north,east" clipped to the scope; undefined when invalid or empty. */
export function intersectBounds(scope: Bounds, raw: string): Bounds | undefined {
  const parts = raw.split(',');
  if (parts.length !== 4) return undefined;
  const n = parts.map((p) => (p.trim() === '' ? NaN : Number(p.trim())));
  if (n.some((v) => !Number.isFinite(v))) return undefined;
  const [south, west, north, east] = n;
  if (south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east) return undefined;
  const b = { south: Math.max(scope.south, south), west: Math.max(scope.west, west), north: Math.min(scope.north, north), east: Math.min(scope.east, east) };
  return b.south < b.north && b.west < b.east ? b : undefined;
}

export const contains = (b: Bounds, lat: number, lng: number) => lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
export const centerOf = (b: Bounds) => ({ lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 });

/** Letters and digits lowercased, accents and apostrophes dropped, the rest as spaces. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\p{M}'’]/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, ' ')
    .toLowerCase();
}

export const searchTerms = (q: string) => normalizeSearch(q).split(/\s+/).filter(Boolean);

/** Every term appears in a name or address, in any language. */
export function matchesSearch(place: { name: LocalizedString; address: LocalizedString }, terms: string[]): boolean {
  const { name, address } = place;
  const text = normalizeSearch([name.ru, name.en, name.ro, address.ru, address.en, address.ro].join(' '));
  return terms.every((t) => text.includes(t));
}

/** strconv.ParseBool. */
export function parseBool(raw: string | undefined, def: boolean): boolean | undefined {
  if (raw === undefined) return def;
  if (['1', 't', 'T', 'TRUE', 'true', 'True'].includes(raw)) return true;
  if (['0', 'f', 'F', 'FALSE', 'false', 'False'].includes(raw)) return false;
  return undefined;
}
