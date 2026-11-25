import { Injectable } from '@nestjs/common';
import { badRequest, notFound } from '../../core/errors/domain-error.js';
import { MOLDOVA_BOUNDS } from '../../database/reference/cities.js';
import { GoogleMapsConfig } from '../../integrations/google/google-maps.config.js';
import { CatalogService } from '../catalog/catalog.service.js';
import type { VenueRecord } from '../catalog/catalog.repository.js';
import type { OpenPlaceRecord } from '../open-places/open-places.repository.js';
import { OpenPlacesService } from '../open-places/open-places.service.js';
import { type Bounds, centerOf, contains, intersectBounds, matchesSearch, parseBool, searchTerms } from './domain/map-search.js';

export type MapPlacesQuery = {
  city_id?: string;
  bounds?: string;
  lang?: string;
  include_google?: string;
  bookable_only?: string;
  q?: string;
};

/** Attribution the map must show for the open data it draws. */
export const OPEN_DATA_ATTRIBUTION = '© OpenStreetMap contributors · Overture Maps Foundation';

const omitEmpty = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));

function venuePlace(v: VenueRecord, bookable: boolean) {
  return {
    id: v.id,
    name: v.name,
    lat: v.lat,
    lng: v.lng,
    address: v.address,
    ...omitEmpty({ rating: v.rating || undefined, google_place_id: v.googlePlaceId.replace(/^places\//, '') }),
    in_database: true,
    bookable,
    venue_id: v.id,
    free_tables: v.freeTables,
    open_now: v.openNow,
    ...omitEmpty({ cuisine: v.cuisine, price_level: v.priceLevel || undefined, average_check: v.averageCheck || undefined, website: v.website, hours_text: v.hoursText }),
  };
}

function openPlace(p: OpenPlaceRecord) {
  return {
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    address: p.address,
    in_database: false,
    bookable: false,
    free_tables: 0,
    ...omitEmpty({ cuisine: p.cuisine, website: p.website, phone: p.phone, opening_hours: p.openingHours }),
    category: p.category,
    sources: p.sources,
  };
}

/** Map of the site: partner venues from the database plus open-data places around them. */
@Injectable()
export class MapService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly openPlaces: OpenPlacesService,
    private readonly google: GoogleMapsConfig,
  ) {}

  async config() {
    const keys = this.google.current();
    return { cities: await this.catalog.listCities(), country_bounds: MOLDOVA_BOUNDS, google_maps_key: keys.browserKey, google_maps_id: keys.mapId };
  }

  async places(query: MapPlacesQuery) {
    const cityId = query.city_id ?? 'city-balti';
    let bounds: Bounds = MOLDOVA_BOUNDS;
    let venueCity: string | undefined;
    if (cityId !== 'all') {
      const city = (await this.catalog.listCities()).find((c) => c.id === cityId);
      if (!city || city.country !== 'MD') throw notFound('city_not_found');
      bounds = city.bounds;
      venueCity = city.id;
    }
    if (query.bounds !== undefined) {
      const clipped = intersectBounds(bounds, query.bounds);
      if (!clipped) throw badRequest('invalid_map_bounds');
      bounds = clipped;
    }
    const lang = query.lang ?? 'ru';
    if (!['ru', 'ro', 'en'].includes(lang)) throw badRequest('invalid_map_language');
    const includeOthers = parseBool(query.include_google, true);
    if (includeOthers === undefined) throw badRequest('invalid_include_google');
    const bookableOnly = parseBool(query.bookable_only, false);
    if (bookableOnly === undefined) throw badRequest('invalid_bookable_only');
    const q = (query.q ?? '').trim();
    if ([...q].length > 100) throw badRequest('invalid_map_query');
    const terms = searchTerms(q);

    const [venues, bookable] = await Promise.all([this.catalog.venueRecords(venueCity), this.catalog.bookableVenueIds()]);
    const partners = venues
      .filter((v) => contains(bounds, v.lat, v.lng) && (!bookableOnly || bookable.has(v.id)))
      .filter((v) => !terms.length || matchesSearch(v, terms))
      .map((v) => venuePlace(v, bookable.has(v.id)));

    const others = includeOthers && !bookableOnly ? (await this.openPlaces.listInBounds(bounds)).filter((p) => !terms.length || matchesSearch(p, terms)).map(openPlace) : [];

    return {
      city_id: cityId,
      country: 'MD',
      center: centerOf(bounds),
      bounds,
      places: [...partners, ...others],
      source: {
        // Google Places is not queried live (cost and storage terms); places come from open data.
        google_enabled: false,
        google_status: 'not_requested',
        google_count: 0,
        database_count: partners.length,
        open_data_count: others.length,
        open_data_updated_at: (await this.openPlaces.lastUpdated()) ?? null,
        attribution: OPEN_DATA_ATTRIBUTION,
      },
    };
  }

  /** Rating, photos and reviews of a venue page; from our database (no live Google). */
  async venuePlaces(id: string) {
    const v = await this.catalog.getVenueRecord(id);
    const photos = v.photoUrls.length ? v.photoUrls : v.imageUrl ? [v.imageUrl] : [];
    return {
      source: 'local',
      google_place_id: v.googlePlaceId,
      rating: v.rating,
      review_count: v.reviewCount,
      photo_urls: photos,
      reviews: v.reviews,
      live_google: false,
    };
  }
}
