import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Public } from '../../core/auth/auth.decorators.js';
import { badRequest } from '../../core/errors/domain-error.js';
import { DEFAULT_CITY_ID } from '../../database/reference/cities.js';
import { GroqClient } from '../../integrations/groq/groq.client.js';
import { presentVenue } from '../catalog/catalog.presenter.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { cleanPrefs, encodePrefs, prefsEmpty, presentPrefs } from './domain/prefs.js';
import { rank } from './domain/rank.js';
import { mergePrefs, parseText } from './domain/rules.js';

const MAX_QUERY = 300;
const body = z.object({
  query: z.string().default(''),
  city_id: z.string().optional(),
  locale: z.string().optional(),
  prefs: z
    .object({
      cuisine: z.array(z.string()).nullish(),
      restaurant_type: z.array(z.string()).nullish(),
      budget: z.object({ min: z.number(), max: z.number() }).nullish(),
      occasion: z.array(z.string()).nullish(),
      practical: z.array(z.string()).nullish(),
    })
    .nullish(),
  filters: z.array(z.string()).optional(),
});

/** POST /discover/ai: free text → filters (Groq when configured, keyword rules otherwise), ranked venues. */
@Public()
@Controller('api/v1/discover')
export class DiscoverController {
  private readonly logger = new Logger(DiscoverController.name);

  constructor(
    private readonly catalog: CatalogService,
    private readonly groq: GroqClient,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('ai')
  @HttpCode(200)
  async ai(@Body({ schema: body }) req: z.infer<typeof body>) {
    const query = req.query.trim();
    if ([...query].length > MAX_QUERY) throw badRequest('invalid_query');
    const current = cleanPrefs((req.prefs ?? {}) as Parameters<typeof cleanPrefs>[0]);

    let next = parseText(query);
    let source = 'rules';
    let explanation = '';
    if (query && this.groq.enabled) {
      try {
        const reading = await this.groq.read(query, current, req.locale ?? '');
        if (!prefsEmpty(reading.prefs) || prefsEmpty(next)) {
          next = reading.prefs;
          source = 'groq';
          explanation = reading.explanation;
        }
      } catch (error) {
        this.logger.warn(`groq failed, using rules: ${String(error).slice(0, 200)}`);
      }
    }
    const prefs = mergePrefs(current, next);

    const cityId = req.city_id || DEFAULT_CITY_ID;
    const [venues, bookable] = await Promise.all([this.catalog.venueRecords(cityId === 'all' ? undefined : cityId), this.catalog.bookableVenueIds()]);
    const places = venues.map((v) => ({
      id: v.id,
      venue_id: v.id,
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      in_database: true,
      bookable: bookable.has(v.id),
      free_tables: v.freeTables,
      open_now: v.openNow,
      cuisine: v.cuisine,
      price_level: v.priceLevel,
      rating: v.rating,
    }));
    const { ranked, exact } = rank(places, prefs, undefined, 8);
    const byId = new Map(venues.map((v) => [v.id, v]));
    return {
      venues: ranked.flatMap((r) => (byId.has(r.venue_id) ? [presentVenue(byId.get(r.venue_id)!)] : [])),
      ranked,
      prefs: presentPrefs(prefs),
      query_string: encodePrefs(prefs),
      exact,
      source,
      explanation,
    };
  }
}
