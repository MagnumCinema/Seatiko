# Discover preference wizard + guided chat (before map)

Date: 2026-09-07  
Status: approved for implementation after user review of this spec

## Goal

1. Let guests choose what they want (food type, restaurant type, budget, occasion, practical needs) **before** searching on the map.
2. Provide a **guided AI-style chat** (scripted chips, no external LLM in v1) that helps fill the same preferences.
3. Redirect to the existing landing map with those preferences applied as **filters + fit ranking** (recommend best matches first).
4. Keep a secondary path to browse the unfiltered map.

## Non-goals

- Real LLM / OpenAI / Anthropic integration (can replace the script later without changing the preference model).
- Flutter / Android parity in this pass (web first; same preference shape planned for later).
- New API endpoints or server-side map filtering for v1.
- New venue `type` field in the backend store (client heuristics / tags for restaurant type until then).
- Replacing or removing the existing hybrid Google map overlay.

## Decisions (from brainstorming)

| Topic | Choice |
|---|---|
| Flow shape | Wizard first, then redirect to filtered map |
| Chat placement | Part of the wizard; helps pick prefs, then “Show map” |
| AI fidelity (v1) | Guided assistant — suggested questions/chips mapped to filters (no external LLM) |
| Preference dimensions | Cuisine, restaurant type, budget, occasion, practical (all) |
| Skip behavior | Primary CTA → wizard; secondary “Browse map” → unfiltered map |
| Platform | Web first; Flutter later |
| Architecture | Hybrid stepper + optional guided chat sharing one preference state |
| Map results | Filter matches **and** rank by fit score (recommendations first) |

## Approach

**Hybrid stepper with optional chat assist** on a dedicated `/discover` page:

- Structured multi-step chips are the source of truth.
- Collapsible “Ask for help” guided chat runs a fixed script and writes into the same state.
- “Show map” encodes preferences into the URL and navigates to the map section.
- `VenueMap` filters and **ranks** client-side against `GET /api/v1/map/places` results (best fit first).

## User flow

1. **Landing hero**
   - Primary CTA (“Find a place”) → `/discover`
   - Secondary (“Browse map”) → `/#map` with no filters

2. **`/discover` wizard**
   - Shared preference state across stepper and chat
   - Stepper for five dimensions; chat fills the same state
   - Summary of picks + **Show map**

3. **Redirect to map**
   - Navigate to `/?cuisine=…&budget=…#map` (query string **before** hash so the app can read prefs; `#map` scrolls to the map section)
   - Map filters to matches, **sorts by fit score** (recommendations), and shows an “Active filters” bar (Edit / Clear)
   - Side list / panel leads with top recommended places; map can fit bounds to the top matches

4. **Skip / clear**
   - From discover: skip → unfiltered map
   - On map: Clear → full catalog; Edit → `/discover` with prefs restored

## Preference model

Shared type: `DiscoverPreferences`.

| Dimension | Example chip values (v1) | Filter behavior |
|---|---|---|
| Cuisine | Moldovan, Italian, Asian, European, Fast food, Cafe sweets, … | Case-insensitive overlap with `cuisine[]` |
| Restaurant type | Restaurant, Cafe, Bar, Fast food, Fine dining | Match tags / name+description heuristics until a dedicated API field exists |
| Budget | `$`, `$$`, `$$$` | Match `price_level` (1–3) |
| Occasion | Quick lunch, Date night, Family, Business, Group | Soft client scoring from description/cuisine/price_level; if a place has no usable signals, keep it (do not hard-exclude) |
| Practical | Open now, Free tables, Partners only, Nearby | `open_now` / `free_tables` / `in_database`; Nearby uses geolocation + distance when available |

### Filter rules

- Empty dimension = no constraint on that axis.
- Multi-select within a dimension = OR; dimensions combine with AND.
- Google-only pins included unless “Partners only”.
- Filtering is **client-side** on map places for v1.
- Prefs encoded in the query string (e.g. `cuisine=italian,asian&budget=2&practical=free_tables`) for share/refresh.

### Recommendation ranking (fit score)

After hard filters (dimensions that can exclude places), remaining places get a **fit score** and are sorted descending:

| Signal | Weight idea (v1) |
|---|---|
| Cuisine overlap | High |
| Budget / `price_level` match | High |
| Practical match (open now, free tables, partner) | Medium–high |
| Restaurant-type heuristic match | Medium |
| Occasion soft match | Medium (bonus only; never the sole reason to exclude) |
| Rating (when present) | Low tie-breaker |
| Nearby distance (when geolocation available) | Low–medium tie-breaker |

- Side list shows places in score order; optional “Recommended” label on the top few.
- Equal scores keep a stable secondary sort (e.g. rating, then name).
- With **no prefs**, ranking falls back to the current default map order (no fake scores).

## Discover UI

### Layout (`/discover`)

- Header with brand + “Browse map” skip link.
- Main: stepper (5 steps), multi-select chips, Next / Back.
- Side panel (desktop) / bottom sheet (mobile): “Ask for help” guided chat; collapsed by default on mobile.
- Sticky footer: selected-picks chips + **Show map**.

### Guided chat (no LLM)

- Scripted turns: one question per dimension, same order as the stepper.
- User replies via chips (same options as the step).
- Chip choice updates shared prefs and advances the chat.
- “Skip this” leaves the dimension empty and continues.
- Assistant copy from a fixed dictionary in `site-copy` (RU/EN/RO).
- Stepper edits keep chat summary in sync (single preference state).

### Map after redirect

- Active filters bar above `VenueMap`.
- Empty results: message + Clear filters / Edit preferences.

## Architecture

### Web components / modules

| Piece | Role |
|---|---|
| `app/discover/page.tsx` | Page shell |
| `components/discover/discover-wizard.tsx` | Prefs state, stepper + chat wiring, redirect |
| `components/discover/preference-stepper.tsx` | Steps + chips |
| `components/discover/guided-chat.tsx` | Scripted dialogue UI |
| `components/discover/preference-summary.tsx` | Sticky picks + Show map |
| `lib/discover-preferences.ts` | Types, chip catalogs, URL encode/decode, filter predicate, fit-score ranking |
| `lib/guided-chat-script.ts` | Turn order + assistant copy keys |
| Landing `page.tsx` | Hero CTAs updated |
| `venue-map.tsx` (or thin wrapper) | Apply filters from URL / search params |

### API

- No new endpoints for v1.
- Existing `POST /discover/ai` remains unused by this web flow (mobile may still use keyword matching).
- A real LLM can later replace `guided-chat-script` without changing `DiscoverPreferences`.

### Data flow

```
chips / chat → DiscoverPreferences → URL query → VenueMap filter + fit rank → markers + recommended list
```

### i18n

All labels and assistant messages live in `site-copy` (RU/EN/RO). Preference **IDs** are locale-stable; only labels change on locale switch.

## Edge cases

| Case | Behavior |
|---|---|
| No prefs selected on Show map | Allowed; unfiltered map (same as Browse map) |
| Geolocation denied for Nearby | Ignore Nearby; keep other filters; soft notice |
| Places still loading | Show map shell + loading; apply filter when data arrives |
| Zero matches | Empty state with Clear / Edit |
| Invalid query params | Ignore unknown keys; apply the rest |
| Locale switch mid-wizard | Keep preference IDs; refresh labels only |

## Testing

- Unit: URL encode/decode of prefs.
- Unit: filter predicate against sample `MapPlace` fixtures.
- Unit: fit-score ranking order for mixed matches / ties.
- Unit: guided chat script advances and writes into shared prefs.
- Manual: hero → discover → show map; browse map skip; edit/clear on map; mobile chat collapse.

## Success criteria

- Guest can set preferences (or use guided chat) and land on a map showing matching places, **ranked by fit** (best recommendations first).
- Guest can skip straight to the full map from the landing page.
- Guest can edit or clear active filters from the map.
- No external LLM dependency for v1.
- Copy works in RU/EN/RO.

## Future (explicitly later)

- Real LLM assistant that fills `DiscoverPreferences`.
- Server-side filter query params on `GET /map/places`.
- Dedicated restaurant `type` on venue/map place models.
- Flutter discover parity using the same preference shape.
