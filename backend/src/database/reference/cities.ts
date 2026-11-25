import type { LocalizedString } from '../schema/columns.js';

/** Moldova as a whole, for the "all cities" map view. */
export const MOLDOVA_BOUNDS = { south: 45.45, west: 26.6, north: 48.55, east: 30.2 };

export type CityRow = {
  id: string;
  slug: string;
  name: LocalizedString;
  available: boolean;
  country: string;
  center: { lat: number; lng: number };
  bounds: { south: number; west: number; north: number; east: number };
};

function city(slug: string, ru: string, ro: string, south: number, west: number, north: number, east: number): CityRow {
  return {
    id: `city-${slug}`,
    slug,
    name: { ru, en: ro, ro },
    available: slug === 'balti',
    country: 'MD',
    center: { lat: (south + north) / 2, lng: (west + east) / 2 },
    bounds: { south, west, north, east },
  };
}

/** Reference data (not demo): the cities of the service, same as moldovaCities() in the Go store. */
export const CITIES: CityRow[] = [
  city('balti', 'Бельцы', 'Bălți', 47.7, 27.84, 47.82, 28.02),
  city('chisinau', 'Кишинёв', 'Chișinău', 46.92, 28.72, 47.12, 29.02),
  city('cahul', 'Кагул', 'Cahul', 45.86, 28.14, 45.96, 28.26),
  city('orhei', 'Оргеев', 'Orhei', 47.34, 28.76, 47.44, 28.89),
  city('soroca', 'Сороки', 'Soroca', 48.11, 28.24, 48.21, 28.35),
  city('ungheni', 'Унгены', 'Ungheni', 47.16, 27.76, 47.27, 27.88),
  city('comrat', 'Комрат', 'Comrat', 46.25, 28.6, 46.34, 28.73),
  city('edinet', 'Единцы', 'Edineț', 48.13, 27.24, 48.21, 27.36),
  city('tiraspol', 'Тирасполь', 'Tiraspol', 46.8, 29.53, 46.9, 29.69),
];

export const DEFAULT_CITY_ID = 'city-balti';
