import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Public } from '../../core/auth/auth.decorators.js';
import { badRequest } from '../../core/errors/domain-error.js';
import { VENUE_TIME_ZONE, venueLocalTime } from '../../core/time/time.js';
import { DEFAULT_CITY_ID } from '../../database/reference/cities.js';
import { CatalogService } from './catalog.service.js';
import { DEFAULT_AVAILABILITY_WINDOW_MIN } from './domain/availability.js';

const MAX_DAYS_OUT = 90;
const RFC3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/i;

/** Optional integer query param in [min, max], else the error code (as intQuery in Go). */
function intParam(raw: string | undefined, def: number, min: number, max: number, code: string): number {
  if (raw === undefined || raw === '') return def;
  if (!/^[+-]?\d+$/.test(raw)) throw badRequest(code);
  const n = Number(raw);
  if (n < min || n > max) throw badRequest(code);
  return n;
}

/** Public catalog, same routes and bodies as the Go API. */
@Public()
@Controller('api/v1')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('cities')
  async cities() {
    return { cities: await this.catalog.listCities() };
  }

  @Get('venues')
  async venues(@Query('city_id') cityId?: string) {
    return { venues: await this.catalog.listVenues(cityId || DEFAULT_CITY_ID) };
  }

  @Get('venues/:id')
  async venue(@Param('id') id: string) {
    return { venue: await this.catalog.getVenue(id) };
  }

  @Get('venues/:id/tables')
  async tables(@Param('id') id: string) {
    return { tables: await this.catalog.listTables(id) };
  }

  @Get('venues/:id/schedule')
  async schedule(@Param('id') id: string) {
    return { slots: await this.catalog.schedule(id) };
  }

  @Get('venues/:id/menu')
  async menu(@Param('id') id: string) {
    return { menu: await this.catalog.listMenu(id) };
  }

  @Get('venues/:id/waitlist/summary')
  async waitlistSummary(@Param('id') id: string) {
    return { summary: await this.catalog.waitlistSummary(id) };
  }

  @Get('collections')
  async collections() {
    return { collections: await this.catalog.listCollections() };
  }

  /** Venues with a free table for the party around the wanted time. */
  @Get('availability')
  @Header('Cache-Control', 'no-store')
  async availability(@Query() q: Record<string, string | undefined>) {
    const cityParam = q.city_id || DEFAULT_CITY_ID;
    const cityId = cityParam === 'all' ? undefined : (await this.catalog.requireCity(cityParam)).id;
    const guests = intParam(q.guests, 2, 1, 50, 'invalid_guests');
    const durationMin = intParam(q.duration_min, 0, 0, 480, 'invalid_duration');
    const windowMin = intParam(q.window_min, DEFAULT_AVAILABILITY_WINDOW_MIN, 0, 360, 'invalid_window');
    const limit = intParam(q.limit, 4, 1, 12, 'invalid_limit');

    const now = new Date();
    let day = now;
    let target: Date | undefined;
    if (q.at) {
      const at = new Date(q.at);
      if (!RFC3339.test(q.at) || Number.isNaN(at.getTime())) throw badRequest('invalid_at');
      target = at;
      day = at;
    } else if (q.date) {
      const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(q.date);
      const [y, mo, d] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
      const check = new Date(Date.UTC(y, mo - 1, d));
      if (!m || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) throw badRequest('invalid_date');
      day = venueLocalTime(y, mo, d, 0);
    }
    if (day.getTime() > now.getTime() + MAX_DAYS_OUT * 24 * 3600_000) throw badRequest('date_too_far');

    const venues = await this.catalog.availability(cityId, { day, target, guests, durationMin, windowMin, limit, now });
    return { venues, timezone: VENUE_TIME_ZONE };
  }
}
