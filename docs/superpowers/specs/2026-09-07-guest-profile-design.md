1# Guest personal profile (cabinet) — web

Date: 2026-09-07  
Status: approved for implementation after user review of this spec

## Goal

1. Give guests a **personal profile / cabinet** matching `docs/APP_LOGIC.md` §8.3 and `docs/UX_SCREENS.md` §13.
2. Expose it as both a **Next.js page** (`/account`) and the **app-shell Profile tab**, sharing one UI.
3. Ship identity + language against the real API; use **local persistence** for favorites and allergies until backend exists; payments as **UI placeholders**; **18+** as read-only stub.
4. Unify **dark / light theme** across marketing pages, auth pages, `/account`, and the guest shell so login/register are not a separate light-only look.

## Non-goals

- Flutter / mobile parity in this pass (web first).
- Real card payment gateway / tokenization.
- Staff 18+ grant tooling or `adult_preorder_*` API fields (document as TODO; UI stub only).
- Backend persistence for favorites or allergies/diet (local + README TODO).
- Merging guest profile with owner `/cabinet`.
- System `prefers-color-scheme` auto-follow (optional later; v1 = explicit toggle + default dark).

## Decisions (from brainstorming)

| Topic | Choice |
|---|---|
| Surfaces | **C** — `/account` page **and** app-shell Profile tab, shared UI |
| Section scope | **A** — full canon from docs (see Content) |
| Favorites | Local (`localStorage`) + README TODO for API |
| Allergies / diet | Local (`localStorage`) + README TODO for API |
| Age 18+ | Read-only “not verified” stub + README TODO for staff grant / user fields |
| Payments | UI placeholders only (no gateway) |
| Architecture | Shared `GuestProfile` component (approach 1) |
| Theme | CSS `data-theme` dark/light; toggle + `localStorage`; default **dark** |
| Route slug | `/account` |
| History | Stays on Orders tab (not duplicated in profile v1) |

## Approach

**Shared `GuestProfile` component** used by:

- `app/account/page.tsx` — `SiteHeader` + page chrome + auth gate + `GuestProfile`
- App-shell Profile tab — replace inline profile fields with `GuestProfile`

Local helpers own non-API prefs. Theme provider (or small hook) sets `document.documentElement.dataset.theme` from stored preference.

## User flow

1. **Signed-out guest** opens `/account` or Profile tab → sign-in CTA (existing auth modal / `/login` as already used in shell).
2. **Signed-in guest** sees profile blocks (identity, language, allergies, payments, favorites, 18+, logout).
3. Edit name / «как обращаться» / locale → `updateMe`; toast on success/failure.
4. Edit allergies or favorites → save locally keyed by `user.id`.
5. Open payments panel → placeholder methods; add/remove does not call a payment API.
6. Theme toggle (header and/or profile) switches dark/light site-wide; preference persists.

## Content & data

| Block | Behavior | Persistence |
|---|---|---|
| Identity | `first_name`, `last_name`, `display_name` («как обращаться»); email read-only | API `updateMe` / `fetchMe` |
| Language | Locale picker; sync `LocaleProvider` + profile | API `locale` |
| Allergies / diet | Editable text / chips locally | `localStorage` by user id |
| Payment methods | Placeholder rows (e.g. “Card •••• 4242”, “Add method”) | None (UI only) |
| Favorites | List of venue ids (+ names cached when added); add/remove; empty state | `localStorage` by user id |
| Age 18+ | Read-only: unverified copy; verified who/when/venue when API exists later | Stub / future API |
| Logout | Existing logout | Session/token clear |

Nested panels (allergies, payments, favorites) live inside `GuestProfile` for v1 — not separate top-level routes.

## Components

| Unit | Responsibility |
|---|---|
| `GuestProfile` | Shared profile UI + nested panels |
| `guest-local-prefs` (lib) | Load/save allergies + favorites; scoped by `user.id` |
| `ThemeProvider` / `useTheme` | Read/write theme; set `html[data-theme]` |
| `/account/page.tsx` | Site layout + auth gate + `GuestProfile` |
| `SiteHeader` | Account link; theme toggle |
| App-shell Profile tab | Mount `GuestProfile`; remove duplicated field markup |

## Theme

- Tokens: CSS variables for background, surface, text, muted, border, accent under `[data-theme="dark"]` and `[data-theme="light"]`.
- Apply on `<html data-theme="…">` so `/`, `/discover`, `/account`, `/login`, `/register`, venues, and app-shell share one system.
- Default: **dark** (matches main marketing surface).
- Persist: `localStorage` key e.g. `fa-theme`.
- Login/register must consume the same tokens (no orphan always-light auth chrome).

## Docs / TODO features

Add a **TODO features** section (prefer `foodassistant/README.md`, cross-link from `docs/README.md` if useful) listing at least:

- [ ] Backend favorites sync (API + DB)
- [ ] Allergies / diet on `User` + `updateMe`
- [ ] Adult 18+ fields (`adult_preorder_allowed`, verifier metadata) + staff grant API
- [ ] Real payment methods / gateway
- [ ] Optional: follow `prefers-color-scheme` when user has not chosen a theme

## Errors

- `updateMe` failure → toast / inline error; keep draft editable.
- `localStorage` failure → keep session usable; soft message; skip persist.
- Unsigned → sign-in CTA; do not flash empty private data.

## Testing

- Unit tests for `guest-local-prefs` (add/remove favorite, allergy round-trip, user scoping).
- Theme helper: default dark; toggle persists.
- Manual: `/account` and Profile tab show the same blocks; login/register respect theme.

## Out of scope reminders

- Do not implement staff ID verification UI in this pass.
- Do not store card PANs; placeholders only.
- Owner `/cabinet` remains restaurant-owner only.

## Success criteria

- Guest can open `/account` and Profile tab and edit identity + language via API.
- Favorites and allergies work locally and survive refresh for that user id.
- Payments and 18+ rows exist with correct semantics (placeholder / read-only).
- Dark/light toggle works across home, auth, and account; default dark.
- README TODO features documents backend follow-ups.
