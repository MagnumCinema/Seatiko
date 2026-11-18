# `/book` page redesign — design

Date: 2026-11-16  
Status: approved for planning  
Tracker: [`docs/WEB_PAGES_STATUS.md`](../../WEB_PAGES_STATUS.md) — keep **В работе** after this pass (do not mark Готово).

## Goal

Improve `/book` (cross-venue free-table search) so it matches the visual language of the venue and menu pages, and tighten UX in three ordered passes — without a new backend.

## Scope

**In**

- Visual redesign aligned with `/venues/[id]` and `/venues/[id]/menu` (shared page chrome, CTAs, field/chip patterns, light/dark).
- UX/logic polish of existing client-side flow, in this order:
  1. Results list + empty / error / skeleton states
  2. Known-venue search + «Подбор по вкусу» (`/discover`)
  3. Filter panel (guests · day · time · duration) hierarchy and clarity
- RU / EN / RO via existing `t("qb.*")` / site-copy
- Mobile layout check
- Keep URL sync: `?q=&guests=&day=&time=&duration=`
- Keep redirect: `/book?venue=<id>` → `/venues/<id>?book=1` (plus time when present)

**Out**

- Marking `/book` as Готово in the tracker
- Server `GET /api/v1/availability` (already tracked in [`BACKEND_TASKS.md`](../../BACKEND_TASKS.md) №2)
- Map / list dual mode on `/book`
- New booking intents or payment flows
- Changing `BookingPopup` contract beyond reuse from this page

## Approach

**Decompose UI + keep availability logic** (chosen over CSS-only polish or a full compositional redesign).

- Keep browser-side availability (`lib/venue-availability.ts` + tables/schedule fetches).
- Split `QuickBookSearch` into single-purpose UI blocks under one orchestrator.
- Styles: venue/menu language in `premium.css` / shared classes; avoid inventing a third visual system.

## Architecture

| Piece | Responsibility |
|-------|----------------|
| `app/book/page.tsx` | Shell: `SiteHeader` / `SiteFooter`, Suspense, `?venue=` redirect |
| `QuickBookSearch` | Orchestrator: load venues+data, query state, availability, popup |
| Filter panel | Guests stepper, day chips, time select (+ ASAP), duration chips |
| Find row | Search input + clear + discover shortcut (catalog-style) |
| Results | Cards with photo, meta, status, slot buttons → `BookingPopup` |
| States | Loading skeletons, network error + retry, empty variants |

## Data flow

1. Load venues for `city-balti`; for each venue fetch tables + schedule (failures → empty arrays for that venue).
2. Derive availability with current query (`guests`, `day`, `time`/`asap`, `duration`) via `venueAvailability` / `availabilityRank`.
3. Persist query to the URL with `history.replaceState` (no full navigation).
4. Refresh data on an interval (~60s) as today.
5. Slot click or «other day» opens the same `BookingPopup` used on the venue page.

## Empty / error behavior

| Situation | UI |
|-----------|----|
| Network failure | Error message + retry |
| Loading | Skeleton cards |
| Text text, no matches | Body copy + clear query + link to `/discover` |
| No free slots (normal browse) | ASAP and/or next-day actions when applicable |
| All venues too small for guest count | Copy about party size / event path |
| Known-venue search with match but no slots | Show the venue (muted) with later-today / pick-other-day / event actions as today |

## Work order

1. Results + empty/error/skeleton (visual + copy)
2. Known-venue search + discover CTA
3. Filter panel usability / hierarchy
4. Verify locales, theme, mobile — **leave tracker status В работе**

## Success criteria (this pass)

- Page feels consistent with venue/menu redesign.
- Three UX areas above are clearly improved without regressing booking popup or URL params.
- No new API endpoints required.
- `WEB_PAGES_STATUS.md` still lists `/book` as В работе.

## Risks

- `premium.css` already has large `/book` sections — prefer consolidating/reusing venue classes over adding another parallel block where possible.
- Fetching schedule for every venue can stay slow; do not solve with a new availability API in this pass.
