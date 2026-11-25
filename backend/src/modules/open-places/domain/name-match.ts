// Name and distance matching used to merge the same place across datasets
// (OSM often has the Russian name, Overture the Romanian/Latin one).

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'j', з: 'z', и: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'iu', я: 'ia',
};

/** Words that say what a place is, not which one it is. */
const GENERIC = new Set([
  'cafe', 'caffe', 'kafe', 'cafenea', 'restaurant', 'restoran', 'restorant', 'bar', 'pub', 'pizzeria',
  'coffee', 'shop', 'lounge', 'the', 'si', 'and', 'i', 'de', 'la',
]);

/** Lowercase Latin letters and digits only: "Andy’s Pizza" → "andys pizza", "Поляна" → "poliana". */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[а-яё]/g, (ch) => CYRILLIC[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Distinctive words of a name, without "cafe", "restaurant" and the like. */
export function nameTokens(value: string): string[] {
  return normalizeName(value).split(' ').filter((w) => w && !GENERIC.has(w));
}

function bigrams(value: string): Map<string, number> {
  const s = value.replace(/ /g, '');
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** 0–1 similarity of two names (Dice on letter pairs of the distinctive words; 1 when one contains the other). */
export function nameSimilarity(a: string, b: string): number {
  const x = nameTokens(a).join(' ');
  const y = nameTokens(b).join(' ');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if ((x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))) return 0.9;
  const gx = bigrams(x);
  const gy = bigrams(y);
  let common = 0;
  let total = 0;
  for (const n of gx.values()) total += n;
  for (const n of gy.values()) total += n;
  for (const [g, n] of gx) common += Math.min(n, gy.get(g) ?? 0);
  return total ? (2 * common) / total : 0;
}

/** Distance in metres between two points (haversine). */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/**
 * Same real place? Close points need a similar name; a far point (geocoded to the
 * street, not the door) needs a near-identical one. Names in two scripts still match
 * through transliteration.
 */
export function samePlace(
  a: { name: string; lat: number; lng: number },
  b: { name: string; lat: number; lng: number },
): boolean {
  const d = distanceM(a.lat, a.lng, b.lat, b.lng);
  if (d > 150) return false;
  const sim = nameSimilarity(a.name, b.name);
  return d <= 60 ? sim >= 0.6 : sim >= 0.85;
}
