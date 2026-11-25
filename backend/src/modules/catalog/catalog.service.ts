import { Injectable } from '@nestjs/common';
import { notFound } from '../../core/errors/domain-error.js';
import { Clock, dbDate } from '../../core/time/time.js';
import { DEFAULT_CITY_ID } from '../../database/reference/cities.js';
import { CatalogRepository, type TableRecord, type VenueRecord } from './catalog.repository.js';
import { presentCity, presentMenuItem, presentTable, presentVenue, sortMenu, venueFromApplication } from './catalog.presenter.js';
import { type AvailabilityQuery, type AvailabilityTable, searchAvailability } from './domain/availability.js';
import { turnMinutes, visitMinutes } from './domain/booking-rules.js';
import { venueSchedule } from './domain/schedule.js';

const DAY = 24 * 3600_000;

const toAvailabilityTable = (t: TableRecord): AvailabilityTable => ({
  id: t.id,
  venueId: t.venueId,
  number: t.number,
  seats: t.seats,
  status: t.status,
  occupiedSince: t.occupiedSince ? dbDate(t.occupiedSince) : null,
  reservedFor: t.reservedFor ? dbDate(t.reservedFor) : null,
});

/** Public catalog: cities, venues, tables, menus, collections, availability. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly repo: CatalogRepository,
    private readonly clock: Clock,
  ) {}

  async listCities() {
    return (await this.repo.listCities()).map(presentCity);
  }

  /** City or 404 city_not_found. */
  async requireCity(id: string) {
    const city = await this.repo.getCity(id);
    if (!city) throw notFound('city_not_found');
    return city;
  }

  /** city_id: default Bălți, "all" for every city. */
  async listVenues(cityId = DEFAULT_CITY_ID) {
    return (await this.repo.listVenues(cityId === 'all' ? undefined : cityId)).map(presentVenue);
  }

  /** Raw venues for other modules (map, open places). */
  venueRecords(cityId?: string): Promise<VenueRecord[]> {
    return this.repo.listVenues(cityId);
  }

  bookableVenueIds(): Promise<Set<string>> {
    return this.repo.bookableVenueIds();
  }

  /** A venue, or the preview of an owner's application (by application id). */
  async getVenueRecord(id: string): Promise<VenueRecord> {
    const venue = await this.repo.getVenue(id);
    if (venue) return venue;
    const app = await this.repo.getApplication(id);
    if (app?.venueId) {
      const published = await this.repo.getVenue(app.venueId);
      if (published) return published;
    }
    if (app) return venueFromApplication(app);
    throw notFound('venue_not_found');
  }

  async getVenue(id: string) {
    return presentVenue(await this.getVenueRecord(id));
  }

  /** Published venue only (tables, schedule, menu, waitlist). */
  private async requireVenue(id: string): Promise<VenueRecord> {
    const venue = await this.repo.getVenue(id);
    if (!venue) throw notFound('venue_not_found');
    return venue;
  }

  async listTables(venueId: string) {
    await this.requireVenue(venueId);
    return (await this.repo.listTables(venueId)).map(presentTable);
  }

  async listMenu(venueId: string) {
    await this.requireVenue(venueId);
    return sortMenu(await this.repo.listMenu(venueId)).map(presentMenuItem);
  }

  async listCollections() {
    return (await this.repo.listCollections()).map((c) => ({ id: c.id, slug: c.slug, title: c.title, venue_ids: c.venueIds }));
  }

  async waitlistSummary(venueId: string) {
    const venue = await this.requireVenue(venueId);
    const waiting = await this.repo.waitingCount(venueId);
    const ahead = Math.max(0, waiting - venue.freeTables);
    return { venue_id: venueId, waiting, quoted_wait_min: ahead * turnMinutes(venue), free_tables: venue.freeTables };
  }

  async schedule(venueId: string) {
    const venue = await this.requireVenue(venueId);
    const [reservations, tables] = await Promise.all([this.repo.scheduleReservations(venueId), this.repo.listTables(venueId)]);
    const visit = visitMinutes(venue);
    return venueSchedule(
      reservations.map((r) => ({
        id: r.id,
        tableId: r.tableId,
        tableNumber: r.tableNumber ?? 0,
        reservedFor: dbDate(r.reservedFor),
        expectedArrival: r.expectedArrival ? dbDate(r.expectedArrival) : null,
        durationMin: r.durationMin > 0 ? r.durationMin : visit,
      })),
      tables.map(toAvailabilityTable),
      visit,
      this.clock.now(),
    );
  }

  /** Free starts across a city's venues (cityId undefined = all cities). */
  async availability(cityId: string | undefined, q: Omit<AvailabilityQuery, 'now'> & { now?: Date }) {
    const now = q.now ?? this.clock.now();
    const venues = await this.repo.listVenues(cityId);
    const tables = await this.repo.listTablesOf(venues.map((v) => v.id));
    // Bookings around the wanted day (a day either side covers late closings and long visits).
    const blocks = await this.repo.activeBlocks(tables.map((t) => t.id), new Date(q.day.getTime() - DAY), new Date(q.day.getTime() + 2 * DAY));
    return searchAvailability(
      venues,
      tables.map(toAvailabilityTable),
      blocks.map((b) => ({ tableId: b.tableId, from: dbDate(b.from), until: dbDate(b.until) })),
      { ...q, now },
    );
  }
}
