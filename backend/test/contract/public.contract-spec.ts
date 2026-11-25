import { api, chisinauDate } from './client.js';

const PILOT = Array.from({ length: 10 }, (_, i) => `venue-${i + 1}`);

// Public catalogue, map and docs: no auth.

describe('health and docs', () => {
  it('GET /healthz', async () => {
    const res = await api('GET', '/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'seatiko-api', status: 'ok' });
  });

  it('serves the OpenAPI contract and Swagger UI', async () => {
    const yaml = await api('GET', '/api/openapi.yaml');
    expect(yaml.status).toBe(200);
    expect(yaml.headers.get('content-type')).toContain('yaml');
    expect(String(yaml.body)).toContain('openapi:');
    const docs = await api('GET', '/api/docs');
    expect(docs.status).toBe(200);
    expect(docs.headers.get('content-type')).toContain('text/html');
  });
});

describe('cities and venues', () => {
  it('GET /cities lists Moldovan cities with Bălți available', async () => {
    const res = await api('GET', '/api/v1/cities');
    expect(res.status).toBe(200);
    const balti = res.body.cities.find((c: any) => c.id === 'city-balti');
    expect(balti).toMatchObject({ slug: 'balti', available: true, country: 'MD', name: { ru: 'Бельцы', en: 'Bălți', ro: 'Bălți' } });
    expect(balti.center).toEqual({ lat: 47.760000000000005, lng: 27.93 });
    expect(balti.bounds).toEqual({ south: 47.7, west: 27.84, north: 47.82, east: 28.02 });
  });

  it('GET /venues returns the 10 pilot venues with booking rules', async () => {
    const res = await api('GET', '/api/v1/venues');
    expect(res.status).toBe(200);
    // Other suites may publish more venues; the 10 pilot venues are always there.
    const ids = res.body.venues.map((x: any) => x.id);
    expect(ids).toEqual(expect.arrayContaining(PILOT));
    const v = res.body.venues.find((x: any) => x.id === 'venue-1');
    expect(v).toMatchObject({
      city_id: 'city-balti',
      name: { ru: 'La Plăcinte' },
      hours_text: expect.any(String),
      booking_interval_min: expect.any(Number),
      allow_preorder: expect.any(Boolean),
      free_tables: expect.any(Number),
    });
    expect(typeof v.lat).toBe('number');
    const other = await api('GET', '/api/v1/venues', { query: { city_id: 'city-chisinau' } });
    expect(other.body.venues).toEqual([]);
  });

  it('GET /venues/{id} and 404', async () => {
    const ok = await api('GET', '/api/v1/venues/venue-1');
    expect(ok.status).toBe(200);
    expect(ok.body.venue.id).toBe('venue-1');
    const missing = await api('GET', '/api/v1/venues/nope');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'venue_not_found' });
  });

  it('GET /venues/{id}/places without Google returns stored media', async () => {
    const res = await api('GET', '/api/v1/venues/venue-1/places');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ live_google: false, rating: expect.any(Number) });
    expect(Array.isArray(res.body.photo_urls)).toBe(true);
  });

  it('GET /venues/{id}/tables, /schedule, /menu', async () => {
    const tables = await api('GET', '/api/v1/venues/venue-1/tables');
    expect(tables.status).toBe(200);
    expect(tables.body.tables.length).toBeGreaterThan(0);
    expect(tables.body.tables[0]).toMatchObject({ id: expect.any(String), venue_id: 'venue-1', seats: expect.any(Number), status: expect.any(String), zone: expect.any(String) });

    const schedule = await api('GET', '/api/v1/venues/venue-1/schedule');
    expect(schedule.status).toBe(200);
    expect(Array.isArray(schedule.body.slots)).toBe(true);

    const menu = await api('GET', '/api/v1/venues/venue-1/menu');
    expect(menu.status).toBe(200);
    const wine = menu.body.menu.find((m: any) => m.id === 'm-v1-13');
    expect(wine).toMatchObject({ contains_alcohol: true, requires_age_18: true, stopped: false, price: expect.any(Number) });
    expect(menu.body.menu.every((m: any) => !m.stopped)).toBe(true);

    expect((await api('GET', '/api/v1/venues/nope/schedule')).status).toBe(404);
    expect((await api('GET', '/api/v1/venues/nope/menu')).status).toBe(404);
  });

  it('GET /venues/{id}/waitlist/summary', async () => {
    const res = await api('GET', '/api/v1/venues/venue-1/waitlist/summary');
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ venue_id: 'venue-1', waiting: expect.any(Number), quoted_wait_min: expect.any(Number), free_tables: expect.any(Number) });
  });

  it('GET /collections', async () => {
    const res = await api('GET', '/api/v1/collections');
    expect(res.status).toBe(200);
    expect(res.body.collections[0]).toMatchObject({ id: expect.any(String), slug: expect.any(String), title: { ru: expect.any(String) }, venue_ids: expect.any(Array) });
  });
});

describe('map', () => {
  it('GET /map/config', async () => {
    const res = await api('GET', '/api/v1/map/config');
    expect(res.status).toBe(200);
    expect(res.body.cities.length).toBeGreaterThan(0);
  });

  it('GET /map/places with area, validation and /discover counts', async () => {
    const all = await api('GET', '/api/v1/map/places', { query: { city_id: 'city-balti', include_google: false } });
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ city_id: 'city-balti', country: 'MD' });
    expect(all.body.places.map((p: any) => p.venue_id)).toEqual(expect.arrayContaining(PILOT));
    expect(all.body.source.google_status).toBe('not_requested');
    expect(all.body.filters).toBeUndefined();

    const counted = await api('GET', '/api/v1/map/places', { query: { include_google: false, cuisine: 'mexican' } });
    const total = counted.body.places.length;
    expect(counted.body.filters).toEqual({ total, matched: 0, relax: { filter: 'cuisine', matched: total } });

    expect((await api('GET', '/api/v1/map/places', { query: { bounds: 'NaN,1,2,3' } })).status).toBe(400);
    expect((await api('GET', '/api/v1/map/places', { query: { city_id: 'unknown' } })).status).toBe(404);
    expect((await api('GET', '/api/v1/map/places', { query: { lang: 'de' } })).body).toEqual({ error: 'invalid_map_language' });
  });

  it('GET /places/photo rejects bad names', async () => {
    const res = await api('GET', '/api/v1/places/photo', { query: { name: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_photo_name' });
  });
});

describe('availability', () => {
  it('GET /availability returns every venue, sorted, with slots', async () => {
    const res = await api('GET', '/api/v1/availability', { query: { date: chisinauDate(1), guests: 2 } });
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Europe/Chisinau');
    expect(res.body.venues.map((v: any) => v.venue_id)).toEqual(expect.arrayContaining(PILOT));
    const v1 = res.body.venues.find((v: any) => v.venue_id === 'venue-1');
    expect(v1).toMatchObject({ fits: true, duration_min: expect.any(Number) });
    expect(v1.slots[0]).toMatchObject({ starts_at: expect.any(String), table_id: expect.any(String), table_number: expect.any(Number) });
  });

  it('validates parameters', async () => {
    for (const [query, error] of [
      [{ guests: 0 }, 'invalid_guests'],
      [{ duration_min: 999 }, 'invalid_duration'],
      [{ limit: 13 }, 'invalid_limit'],
      [{ at: 'tomorrow' }, 'invalid_at'],
      [{ date: '2026-13-01' }, 'invalid_date'],
    ] as const) {
      const res = await api('GET', '/api/v1/availability', { query });
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(res.body).toEqual({ error });
    }
    expect((await api('GET', '/api/v1/availability', { query: { city_id: 'unknown' } })).status).toBe(404);
  });
});

describe('discover AI (rules, no model key on test servers)', () => {
  it('POST /discover/ai reads text into filters and ranks venues', async () => {
    const res = await api('POST', '/api/v1/discover/ai', { body: { query: 'недорогое итальянское на свидание', locale: 'ru' } });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rules');
    expect(res.body.query_string).toContain('cuisine=italian');
    expect(res.body.prefs.occasion).toContain('date_night');
    expect(res.body.venues.length).toBe(res.body.ranked.length);
    expect(res.body.ranked[0]).toMatchObject({ venue_id: expect.any(String), score: expect.any(Number), reasons: expect.any(Array) });
  });

  it('rejects too long queries', async () => {
    const res = await api('POST', '/api/v1/discover/ai', { body: { query: 'я'.repeat(301) } });
    expect(res.status).toBe(400);
  });
});

describe('Twenty integration (disabled on test servers)', () => {
  it('status and webhook answer 503 crm_disabled', async () => {
    const status = await api('GET', '/api/v1/integrations/twenty/status');
    expect(status.status).toBe(503);
    expect(status.body).toEqual({ enabled: false, healthy: false });
    const hook = await api('POST', '/api/v1/integrations/twenty/webhook', { body: {} });
    expect(hook.status).toBe(503);
    expect(hook.body).toEqual({ error: 'crm_disabled' });
  });
});
