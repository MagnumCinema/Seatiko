# Discover categories box density + MDL budget

Date: 2026-09-16  
Status: approved for implementation after user review of this spec  
Branch: `feat/discover-preference-box-polish`

## Goal

Make the `/discover` preference (categories) box feel less empty and more comfortable by:

1. Turning option chips into a denser tile grid with subtle icons
2. Showing more options by default (Show more still available)
3. Removing the tall empty card (fixed min-height)
4. Replacing $ / $$ / $$$ budget UI with a single MDL range + preset buttons

Keep soft auto-advance, step rail, Ask for help, and map ranking model unless noted below.

## Decisions (from brainstorming)

| Topic | Choice |
|---|---|
| Emptiness drivers | All: few chips, tall card void, flat pills |
| Intensity | Medium — tile chips + denser grid (not “menu board” maximalism) |
| Approach | Tile grid + expand primary sets; keep Show more |
| Budget UX | One dual-thumb range in **MDL** + presets that snap the range |
| Currency | MDL only for now (no multi-currency) |
| Venue prices | Soft-map MDL → existing `price_level` (1–3); no real MDL API yet |

## §1 — Layout & density

### Card

- Remove fixed `min-height: 560px` on `.discover-stepper` (and matching layout companions if they only exist to match that height).
- Keep rail + body + footer; body height follows content.
- Add a light **inner panel** behind the options area so the middle of the card doesn’t read as empty void.

### Chip grid

- Options render as a responsive **tile grid**:
  - Desktop: 3 columns
  - Mobile (≤640px): 2 columns
- Consistent tile min-height and gap so the field looks full even with fewer labels.

### Default visible counts (before Show more)

| Step | Default visible | Was |
|---|---|---|
| Cuisine | 8 | 4 |
| Restaurant type | 6 | 3 |
| Occasion | 6 | 3 |
| Practical | 6 | 3 |

- Move enough ids from `*_MORE` into `*_PRIMARY` (or equivalent) to hit these counts.
- **Show more / Show less** remains for the long tail; expanded chips use the same tile style in a second grid block.

## §1b — Budget (MDL range + presets)

### UI

- **One** dual-thumb range control:
  - Min bound **50**, max bound **1000**, step **50**
  - Currency label **MDL**
  - Live readout, e.g. `150 – 450 MDL`
- **Preset buttons** (same tile language as other steps), e.g.:
  - Under 200 → `{ min: 50, max: 200 }`
  - 200–400 → `{ min: 200, max: 400 }`
  - 400–700 → `{ min: 400, max: 700 }`
  - 700–1000 → `{ min: 700, max: 1000 }`
  - Any → clear budget filter (no min/max active)
- Presets snap both thumbs; dragging the range can leave “custom” (no preset highlighted unless values match).
- No $ / $$ / $$$ dual-slider UI; no separate min/max slider rows.

### Preference model

- Replace `budget: BudgetLevel[]` (`1 | 2 | 3`) with an explicit money range, e.g.:

  ```ts
  budget: { min: number; max: number } | null
  ```

  - `null` / absent = Any (no budget filter)
  - When set: `50 ≤ min ≤ max ≤ 1000`, multiples of 50

- URL encode/decode: e.g. `budget=150-450` or omit when Any. Drop legacy `budget=1,2,3` or map best-effort once for old links (optional; prefer clean break if unused in production).

### Soft map to `price_level` (filter/score only)

Places still expose Google-style `price_level` 1–3. Soft-map the active MDL range to levels for hard-filter / score (users never see levels):

| Overlap rule | Maps toward |
|---|---|
| Range intersects 50–250 | level 1 |
| Range intersects 200–550 | level 2 |
| Range intersects 500–1000 | level 3 |

A range may match multiple levels (e.g. 150–400 → 1+2). Unknown/`null` `price_level` stays non-excluding for hard filter (same policy as today).

Exact band edges may be tuned in implementation as long as they stay documented in code comments/tests.

## §2 — Tile chips & icons

- Tile anatomy: **icon + label** (+ check when selected).
- Shape: rounded rectangle (not pill).
- Unselected: muted border + light surface tint.
- Selected: gold fill, dark text, checkmark.
- Icons: small inline map keyed by chip id (cuisine / type / occasion / practical / budget presets). No new icon-pack dependency.
- Budget presets use the same tile component row under the range.

## §3 — Copy, motion, scope

### Copy (EN / RU / RO)

- Update budget hint to MDL range language.
- Replace `budget1`/`budget2`/`budget3` `$`/`$$`/`$$$` with preset labels + MDL readout helpers as needed.
- Keep existing step / Show more / Continue / See places strings unless a short tweak improves clarity.

### Motion

- Chip press scale (existing).
- Short fade / crossfade when step content changes (match current polish spirit; no heavy animation).

### Out of scope

- Guided chat rewrite
- Map chrome redesign
- Flutter
- Real per-venue MDL prices from API
- Multi-currency

### Verification

- Unit tests: MDL range helpers, preset → range, URL encode/decode, soft `price_level` mapping, primary-count constants
- Manual: light/dark, mobile 2-col, Show more, budget drag + presets + Any, keyboard/focus

## Non-goals / unchanged

- Soft auto-advance timing and rules
- Step rail + Back / Continue / See the places flow
- Ask for help panel (spacing only if the taller tile grid needs a nudge)
- Map recommendation ranking weights except budget soft-map input

## Implementation notes

- Work on `feat/discover-preference-box-polish` (worktree already has rail / show-more / old budget range).
- Rebuild Docker web image from that worktree after implementation so `localhost/discover` reflects the change (compose build from `docs/guest-profile-design` will regress discover until branches merge).
