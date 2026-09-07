# Landing hero feature cards + map Google Places overlay

Date: 2026-09-04  
Status: approved for implementation after user review of this spec

## Goal

1. Keep the landing hero photo; replace the two decorative floating cards with real FoodAssistant feature messaging.
2. Show on the city map all food-related establishments from Google Places around Bălți, and clearly mark which ones exist in our database vs which do not.
3. Leave room for a future “view menu for any place” flow without building it now.

## Non-goals

- Pulling or displaying menus for Google-only places (future).
- Fuzzy name/geo matching for `in_database` (v1 uses `google_place_id` only).
- Exposing Google Places API keys to the browser.
- Changing Android map in this iteration (web first; same API can be reused later).
- “Notify me / suggest add” CTA on non-database places.

## Decisions (from brainstorming)

| Topic | Choice |
|---|---|
| Hero right side | Keep photo; replace floating card copy with product features |
| External places source | Google Places (Nearby / food types) merged with DB venues |
| Visual distinction | Different pin color + “can book” badge only for in-database places |
| Membership flag | Explicit `in_database` boolean; missing/`false` means not in our DB |
| Click on non-DB place | Popup with name/rating + “Coming soon to FoodAssistant” |
| Matching rule | Exact `google_place_id` match only |

## Approach

**Backend merge endpoint** (not client-side Google calls):

- New public API: `GET /api/v1/map/places` (city-scoped, default Bălți).
- Server calls Google Places API (New) for food-related places near the city center.
- Server loads published venues from the FoodAssistant store.
- Server merges into a single list of map points with an explicit `in_database` flag.
- Web `VenueMap` consumes this endpoint instead of (or in addition to, then replaced by) `GET /venues` for pin data.

## Data model

### Map place (API response item)

```json
{
  "id": "string",
  "name": "string",
  "lat": 47.76,
  "lng": 27.92,
  "address": "optional string",
  "rating": 4.5,
  "google_place_id": "optional string",
  "in_database": false,
  "venue_id": "optional string",
  "free_tables": 0,
  "open_now": null,
  "cuisine": [],
  "price_level": null,
  "website": null
}
```

Rules:

- `in_database` is always present. Default is `false`.
- `in_database: true` only when the place is linked to a published venue (matched by `google_place_id`, or the row is a DB-only venue without a Google counterpart).
- For Google-only places: `id` may be the Google place id (or a stable prefixed id); `venue_id` is omitted; booking fields (`free_tables`, etc.) are empty/zero.
- For DB venues matched to Google: keep FoodAssistant operational fields from the venue; prefer venue name/address for display consistency; set `venue_id` and `in_database: true`.
- For DB venues with no Google match: still emit a point with `in_database: true` so our partners are never hidden when Google misses them.

### Response envelope

```json
{
  "city_id": "city-balti",
  "center": { "lat": 47.7622, "lng": 27.9289 },
  "places": [ /* Map place[] */ ],
  "source": {
    "google_enabled": true,
    "google_count": 0,
    "database_count": 0
  }
}
```

If Google is disabled or fails: return DB venues only with `in_database: true`, `google_enabled: false`, and do not fail the whole map.

## Matching

1. Build a set of published venues keyed by normalized `google_place_id` (strip `places/` prefix if present).
2. For each Google food place: if its id is in that set → `in_database: true`, attach `venue_id` and venue live fields; else `in_database: false`.
3. Emit any remaining published venues that were not matched so they still appear.
4. No fuzzy name/distance matching in this version.

## Google query

- Use Places API (New) nearby / searchNearby (or equivalent already used in the project) around Bălți center.
- Included types: food-related (e.g. restaurant, cafe, bar, bakery, meal_takeaway — exact list chosen to match Google’s allowed type set for the chosen method).
- Reasonable radius for the city (e.g. ~3–5 km); cap result count to protect quota.
- Cache response briefly on the server (e.g. 5–15 minutes in memory) to avoid hammering Google on every map load.
- Reuse existing `GOOGLE_PLACES_API_KEY` / places client; extend client rather than calling Google from Next.js.

## Frontend — hero

Keep `.landing-visual` / `.hero-image`.

Replace floating cards content via `site-copy` (RU/EN/RO):

1. **Map card** — title: live city map / free tables; short supporting line.
2. **Table + QR card** — title: pick a table + order by QR; short supporting line.

No fake venue names or hardcoded times (remove “La Plăcinte · 19:30” / “12 tables available” marketing fiction). Visual structure (icon + two text lines) can stay; only copy and meaning change.

## Frontend — map UI

- Fetch `GET /api/v1/map/places`.
- Two pin styles:
  - `in_database: true` — brand accent color + “can book” badge/indicator.
  - `in_database: false` — neutral/muted pin, no book badge.
- Legend under or over the map explaining both states.
- Popup / panel:
  - In DB: current behavior (name, free tables, links to venue page + book).
  - Not in DB: name, optional rating/address, copy “Coming soon to FoodAssistant”; no book CTA.
- Right panel list: show both kinds; visually distinguish in-database rows (e.g. badge). Prefer sorting in-database first, then others by rating/name.
- Keep MapLibre + OpenFreeMap tiles (base map unchanged).

## i18n

Add/update keys in `site-copy.ts` for:

- Hero floating card titles/bodies (both cards).
- Map legend labels.
- “Coming soon to FoodAssistant” popup line.
- Optional short map section body tweak if current copy still says “only our restaurants”.

## Docs touch-up

Update `docs/MAP_ARCHITECTURE.md` so it no longer claims restaurants come only from the FoodAssistant store; document the hybrid Google overlay + `in_database` flag.

## Future hook (out of scope now)

Map places already carry `google_place_id`. A later feature can attach menu viewing for any place (in DB or not) without changing pin identity. Do not add menu UI or endpoints in this work.

## Testing / verification

1. Hero shows photo + two feature cards; no fake booking confirmation text.
2. With Google key enabled: map shows Google food places + DB venues; matched ones have `in_database: true` and book badge.
3. Unmatched Google places: muted pin, “Coming soon” popup, no book link.
4. With Google disabled/failing: map still shows DB venues, healthy UX.
5. Locale switch updates hero cards, legend, and coming-soon copy.
6. `/healthz` and existing venue booking flows unchanged for in-database venues.

## Implementation outline (for the later plan)

1. Extend places client with nearby food search + short TTL cache.
2. Add `GET /api/v1/map/places` handler + merge logic.
3. Update web types + `fetchMapPlaces`.
4. Update `VenueMap` layers, legend, popup/panel branching on `in_database`.
5. Update hero cards + `site-copy`.
6. Update MAP_ARCHITECTURE.md.
7. Manual verify on `http://localhost` / docker compose.
