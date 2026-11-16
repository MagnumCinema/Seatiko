# `/book` Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve `/book` so it matches venue/menu visual language and tighten UX (results/empty → find/discover → filters), without a new backend and without marking the page Готово.

**Architecture:** Keep client-side availability (`venue-availability` + per-venue tables/schedule). Extract pure result-partition helpers (unit-tested). Split `QuickBookSearch` UI into find row, filters, result card, and empty/error blocks under one orchestrator. Polish CSS toward venue/menu tokens; reuse `BookingPopup` and URL query sync.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, `messages/{ru,en,ro}.json`, CSS in `premium.css`.

**Spec:** `docs/superpowers/specs/2026-11-16-book-page-redesign-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `seatiko/apps/web/src/lib/quick-book-partition.ts` | Pure: which cards to show, empty-kind, “others” lists |
| `seatiko/apps/web/src/lib/quick-book-partition.test.ts` | Unit tests for partition / empty-kind |
| `seatiko/apps/web/src/components/quick-book-empty.tsx` | Empty + network-error UI (retry, ASAP, next day, discover) |
| `seatiko/apps/web/src/components/quick-book-result-card.tsx` | One venue result card (photo, status, slots, actions) |
| `seatiko/apps/web/src/components/quick-book-find.tsx` | Known-venue search + `/discover` shortcut |
| `seatiko/apps/web/src/components/quick-book-filters.tsx` | Guests / day / time / duration panel |
| `seatiko/apps/web/src/components/quick-book-search.tsx` | Orchestrator: data load, query URL, availability, popup |
| `seatiko/apps/web/src/app/book/page.tsx` | Shell only (header/footer, Suspense, `?venue=` redirect) — touch only if class names need aligning |
| `seatiko/apps/web/src/app/premium.css` | `/book` (`.qb-*`) visual polish; consolidate duplicate `.qb-search` rules where safe |
| `seatiko/apps/web/messages/{ru,en,ro}.json` | Copy tweaks for empty/error/retry; keep `qb.*` keys |
| `docs/WEB_PAGES_STATUS.md` | Short note under `/book` that this pass improved UX — **status stays В работе** |

**Do not:** implement `GET /availability`, flip tracker to Готово, redesign `BookingPopup`, add map mode.

---

### Task 1: Partition helpers (TDD)

**Files:**
- Create: `seatiko/apps/web/src/lib/quick-book-partition.ts`
- Create: `seatiko/apps/web/src/lib/quick-book-partition.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `seatiko/apps/web/src/lib/quick-book-partition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  emptyKind,
  partitionQuickBookResults,
  type QuickBookRow,
} from "./quick-book-partition";
import type { VenueAvailability } from "./venue-availability";

function avail(partial: Partial<VenueAvailability>): VenueAvailability {
  return {
    durationMin: 90,
    fits: true,
    exact: null,
    slots: [],
    ...partial,
  };
}

function row(
  id: string,
  availability: VenueAvailability,
  laterToday: VenueAvailability | null = null,
): QuickBookRow {
  return {
    venue: { id } as QuickBookRow["venue"],
    availability,
    laterToday,
    rank: 0,
  };
}

describe("partitionQuickBookResults", () => {
  it("browse mode shows only venues with slots", () => {
    const slot = {
      start: new Date(2026, 10, 12, 19, 0),
      end: new Date(2026, 10, 12, 20, 30),
      available: true,
      tableId: "t2",
    };
    const withSlots = row("a", avail({ slots: [slot] }));
    const busy = row("b", avail({ slots: [] }));
    const small = row("c", avail({ fits: false, slots: [] }));
    const p = partitionQuickBookResults({
      results: [withSlots, busy, small],
      searching: false,
      queryText: "",
    });
    expect(p.cards.map((r) => r.venue.id)).toEqual(["a"]);
    expect(p.unavailable.map((r) => r.venue.id)).toEqual(["b"]);
    expect(p.tooSmall.map((r) => r.venue.id)).toEqual(["c"]);
    expect(p.matched).toHaveLength(3);
  });

  it("search mode shows all text matches as cards", () => {
    const busy = row("b", avail({ slots: [] }));
    const p = partitionQuickBookResults({
      results: [busy],
      searching: true,
      queryText: "cafe",
      textMatchIds: new Set(["b"]),
    });
    expect(p.cards.map((r) => r.venue.id)).toEqual(["b"]);
    expect(p.matched).toHaveLength(1);
  });
});

describe("emptyKind", () => {
  it("returns null while loading or on network failure (UI handles those)", () => {
    expect(emptyKind({ loading: true, failed: false, searching: false, matchedCount: 0, availableCount: 0, tooSmallCount: 0, resultsCount: 0 })).toBeNull();
    expect(emptyKind({ loading: false, failed: true, searching: false, matchedCount: 0, availableCount: 0, tooSmallCount: 0, resultsCount: 3 })).toBeNull();
  });

  it("detects search miss, all-too-small, and no free slots", () => {
    expect(
      emptyKind({
        loading: false,
        failed: false,
        searching: true,
        matchedCount: 0,
        availableCount: 0,
        tooSmallCount: 0,
        resultsCount: 5,
      }),
    ).toBe("search-miss");

    expect(
      emptyKind({
        loading: false,
        failed: false,
        searching: false,
        matchedCount: 3,
        availableCount: 0,
        tooSmallCount: 3,
        resultsCount: 3,
      }),
    ).toBe("too-small-all");

    expect(
      emptyKind({
        loading: false,
        failed: false,
        searching: false,
        matchedCount: 3,
        availableCount: 0,
        tooSmallCount: 1,
        resultsCount: 3,
      }),
    ).toBe("no-slots");
  });
});
```

Adjust the `slots` fixture to match `AnyTableSlot` from `booking-slots` (copy a minimal object from `venue-availability.test.ts` if the cast is awkward).

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd seatiko/apps/web && npm test -- src/lib/quick-book-partition.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement helpers**

Create `seatiko/apps/web/src/lib/quick-book-partition.ts`:

```ts
import type { Venue } from "@/lib/api";
import type { VenueAvailability } from "@/lib/venue-availability";

export type QuickBookRow = {
  venue: Venue;
  availability: VenueAvailability;
  laterToday: VenueAvailability | null;
  rank: number;
};

export type EmptyKind = "search-miss" | "too-small-all" | "no-slots";

export function partitionQuickBookResults({
  results,
  searching,
  textMatchIds,
}: {
  results: QuickBookRow[];
  searching: boolean;
  queryText: string;
  textMatchIds?: Set<string>;
}): {
  matched: QuickBookRow[];
  available: QuickBookRow[];
  unavailable: QuickBookRow[];
  tooSmall: QuickBookRow[];
  cards: QuickBookRow[];
} {
  const matched = searching
    ? results.filter((r) => textMatchIds?.has(r.venue.id))
    : results;
  const available = matched.filter((r) => r.availability.slots.length > 0);
  const unavailable = matched.filter((r) => r.availability.fits && r.availability.slots.length === 0);
  const tooSmall = matched.filter((r) => !r.availability.fits);
  const cards = searching ? matched : available;
  return { matched, available, unavailable, tooSmall, cards };
}

export function emptyKind(input: {
  loading: boolean;
  failed: boolean;
  searching: boolean;
  matchedCount: number;
  availableCount: number;
  tooSmallCount: number;
  resultsCount: number;
}): EmptyKind | null {
  if (input.loading || input.failed) return null;
  if (input.searching && input.matchedCount === 0) return "search-miss";
  if (!input.searching && input.availableCount === 0 && input.resultsCount > 0) {
    if (input.tooSmallCount === input.resultsCount) return "too-small-all";
    return "no-slots";
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd seatiko/apps/web && npm test -- src/lib/quick-book-partition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add seatiko/apps/web/src/lib/quick-book-partition.ts seatiko/apps/web/src/lib/quick-book-partition.test.ts
git commit -m "$(cat <<'EOF'
feat(web): extract /book result partition helpers

EOF
)"
```

---

### Task 2: Empty / error UI + wire partition in orchestrator

**Files:**
- Create: `seatiko/apps/web/src/components/quick-book-empty.tsx`
- Modify: `seatiko/apps/web/src/components/quick-book-search.tsx`
- Modify: `seatiko/apps/web/messages/ru.json` (and `en.json`, `ro.json`) — add `qb.retry` if missing
- Modify: `seatiko/apps/web/src/app/premium.css` (`.qb-empty`, error block)

- [ ] **Step 1: Add retry copy (RU/EN/RO)**

In each messages file, after `qb.none_body` (or near other `qb.*` keys), add:

```json
"qb.retry": "Повторить",
```

EN: `"Try again"` · RO: `"Încearcă din nou"`.

- [ ] **Step 2: Create `QuickBookEmpty`**

Create `seatiko/apps/web/src/components/quick-book-empty.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { EmptyKind } from "@/lib/quick-book-partition";
import { useLocale } from "@/components/locale-provider";

type Props = {
  kind: EmptyKind | null;
  failed: boolean;
  guests: number;
  timeIsAsap: boolean;
  canNextDay: boolean;
  onRetry: () => void;
  onClearSearch: () => void;
  onTryAsap: () => void;
  onTryNextDay: () => void;
};

export function QuickBookEmpty({
  kind,
  failed,
  guests,
  timeIsAsap,
  canNextDay,
  onRetry,
  onClearSearch,
  onTryAsap,
  onTryNextDay,
}: Props) {
  const { t } = useLocale();

  if (failed) {
    return (
      <div className="qb-empty qb-empty-error" role="alert">
        <p>{t("common.error")}</p>
        <div>
          <button type="button" className="venue-cta venue-cta-outline" onClick={onRetry}>
            {t("qb.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!kind) return null;

  if (kind === "search-miss") {
    return (
      <div className="qb-empty">
        <p>{t("qb.nothing_body")}</p>
        <div>
          <button type="button" className="venue-cta venue-cta-outline" onClick={onClearSearch}>
            {t("qb.find_clear")}
          </button>
          <Link href="/discover" className="venue-cta venue-cta-outline">
            {t("qb.discover")}
          </Link>
        </div>
      </div>
    );
  }

  if (kind === "too-small-all") {
    return (
      <div className="qb-empty">
        <p>{t("qb.none_group", { guests })}</p>
      </div>
    );
  }

  return (
    <div className="qb-empty">
      <p>{t("qb.none_body")}</p>
      <div>
        {!timeIsAsap ? (
          <button type="button" className="venue-cta venue-cta-outline" onClick={onTryAsap}>
            {t("qb.try_asap")}
          </button>
        ) : null}
        {canNextDay ? (
          <button type="button" className="venue-cta venue-cta-outline" onClick={onTryNextDay}>
            {t("qb.try_next_day")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire partition + empty into `QuickBookSearch`**

In `quick-book-search.tsx`:

1. Import `partitionQuickBookResults`, `emptyKind`, and `QuickBookEmpty`.
2. After computing `results`, replace inline `matched` / `available` / `unavailable` / `tooSmall` / `cards` with:

```ts
const textMatchIds = searching
  ? new Set(
      results.filter((r) => matchesVenueQuery(r.venue, query.text)).map((r) => r.venue.id),
    )
  : undefined;
const { matched, available, unavailable, tooSmall, cards } = partitionQuickBookResults({
  results,
  searching,
  queryText: query.text,
  textMatchIds,
});
const kind = emptyKind({
  loading,
  failed,
  searching,
  matchedCount: matched.length,
  availableCount: available.length,
  tooSmallCount: tooSmall.length,
  resultsCount: results.length,
});
```

3. Replace the inline empty/error JSX with:

```tsx
<QuickBookEmpty
  kind={kind}
  failed={failed}
  guests={query.guests}
  timeIsAsap={query.time === "asap"}
  canNextDay={query.day < DAYS_AHEAD - 1}
  onRetry={() => {
    setLoading(true);
    setFailed(false);
    setReloadKey((k) => k + 1);
  }}
  onClearSearch={() => update({ text: "" })}
  onTryAsap={() => update({ time: "asap" })}
  onTryNextDay={() => update({ day: query.day + 1 })}
/>
```

Remove the old `{failed ? <p className="web-book-error">…` and the large empty-state ternary block (keep results grid + others).

- [ ] **Step 4: CSS for empty/error**

In `premium.css` under the `/book` section, ensure `.qb-empty` uses venue-like surface (solid border, not only dashed), and add:

```css
.qb-empty-error {
  border-style: solid;
  border-color: color-mix(in srgb, var(--fa-danger, #c45c5c) 45%, var(--fa-border));
}
```

(Use an existing error/danger token if the codebase already has one; do not invent purple.)

- [ ] **Step 5: Typecheck**

Run:

```bash
cd seatiko/apps/web && npx tsc --noEmit
```

Expected: no errors from new files.

- [ ] **Step 6: Commit**

```bash
git add seatiko/apps/web/src/components/quick-book-empty.tsx \
  seatiko/apps/web/src/components/quick-book-search.tsx \
  seatiko/apps/web/messages/ru.json seatiko/apps/web/messages/en.json seatiko/apps/web/messages/ro.json \
  seatiko/apps/web/src/app/premium.css
git commit -m "$(cat <<'EOF'
feat(web): /book empty and error states with retry

EOF
)"
```

---

### Task 3: Result card component + visual polish

**Files:**
- Create: `seatiko/apps/web/src/components/quick-book-result-card.tsx`
- Modify: `seatiko/apps/web/src/components/quick-book-search.tsx`
- Modify: `seatiko/apps/web/src/app/premium.css` (`.qb-card*`, `.qb-grid`, `.qb-results-head`, skeletons)

- [ ] **Step 1: Extract `QuickBookResultCard`**

Move the `<article className="qb-card">…` JSX from `quick-book-search.tsx` into `quick-book-result-card.tsx` with props:

```ts
type Props = {
  venue: Venue;
  availability: VenueAvailability;
  laterToday: VenueAvailability | null;
  guests: number;
  durationMin: number;
  dayLabel: string;
  target: Date | null;
  cuisineLabels: Record<string, string>;
  onPickSlot: (timeIso: string, durationMin: number) => void;
  onPickOtherDay: (durationMin: number) => void;
};
```

Keep status/slot/action logic identical; only change classnames if CSS polish needs a BEM-consistent hook (prefer existing `.qb-*`).

- [ ] **Step 2: Render cards via the new component**

In the results grid:

```tsx
{cards.map((row) => (
  <QuickBookResultCard
    key={row.venue.id}
    venue={row.venue}
    availability={row.availability}
    laterToday={row.laterToday}
    guests={query.guests}
    durationMin={query.duration}
    dayLabel={dayLabel(query.day)}
    target={target}
    cuisineLabels={cuisineLabels}
    onPickSlot={(time, durationMin) =>
      setPopup({ venue: row.venue, time, durationMin, nonce: Date.now() })
    }
    onPickOtherDay={(durationMin) =>
      setPopup({ venue: row.venue, time: null, durationMin, nonce: Date.now() })
    }
  />
))}
```

- [ ] **Step 3: Visual polish in CSS**

Align cards with venue/menu:

- Photo radius / aspect consistent with catalog or menu dish thumbs
- Clearer status colors (exact / none) using existing `--state-*` tokens
- Skeleton shimmer already present — ensure `prefers-reduced-motion` still disables it
- Results head typography matches `.venue-page` / `.menu-hero-copy` scale
- Light theme overrides already exist — keep gold accents on `#8a6528` pattern used elsewhere

Avoid: new purple gradients, card-in-hero patterns, floating badges on photos.

- [ ] **Step 4: Commit**

```bash
git add seatiko/apps/web/src/components/quick-book-result-card.tsx \
  seatiko/apps/web/src/components/quick-book-search.tsx \
  seatiko/apps/web/src/app/premium.css
git commit -m "$(cat <<'EOF'
feat(web): extract /book result cards and polish layout

EOF
)"
```

---

### Task 4: Find row (known venue + discover)

**Files:**
- Create: `seatiko/apps/web/src/components/quick-book-find.tsx`
- Modify: `seatiko/apps/web/src/components/quick-book-search.tsx`
- Modify: `seatiko/apps/web/src/app/premium.css` (`.qb-find`, reuse `.catalog-search-row`)

- [ ] **Step 1: Extract `QuickBookFind`**

Props:

```ts
type Props = {
  value: string;
  onChange: (text: string) => void;
};
```

Markup: same as current find row (`catalog-search-wrap` + clear + `Link` to `/discover` with `SparklesIcon`). Ensure `aria-label`s stay on input/clear.

- [ ] **Step 2: Place find above filters**

In orchestrator order: hero → **find** → filters → results head → empty → grid → others.

- [ ] **Step 3: CSS**

- Keep find on one row with discover CTA on desktop (mirror `/venues` catalog row)
- On narrow screens, stack: search full width, discover full width or equal split — match `.catalog-search-row` breakpoints in `premium.css` (~7002)
- Do not shrink discover label into two awkward lines (lesson from catalog i18n)

- [ ] **Step 4: Commit**

```bash
git add seatiko/apps/web/src/components/quick-book-find.tsx \
  seatiko/apps/web/src/components/quick-book-search.tsx \
  seatiko/apps/web/src/app/premium.css
git commit -m "$(cat <<'EOF'
feat(web): extract /book find row and align with catalog search

EOF
)"
```

---

### Task 5: Filter panel polish

**Files:**
- Create: `seatiko/apps/web/src/components/quick-book-filters.tsx`
- Modify: `seatiko/apps/web/src/components/quick-book-search.tsx`
- Modify: `seatiko/apps/web/src/app/premium.css` (`.qb-search`, sticky, mobile grid)

- [ ] **Step 1: Extract `QuickBookFilters`**

Props:

```ts
type Props = {
  guests: number;
  day: number;
  time: string;
  duration: number;
  daysAhead: number;
  durations: number[];
  timeOptions: string[];
  dayLabel: (offset: number) => string;
  durationLabel: (min: number) => string;
  clock: (d: Date) => string;
  onChange: (patch: Partial<{ guests: number; day: number; time: string; duration: number }>) => void;
};
```

Move the `<section className="qb-search">` block unchanged in behavior (stepper, day chips, time select with ASAP, duration chips). Keep `aria-pressed` / labels.

- [ ] **Step 2: Hierarchy CSS**

Target layout (desktop):

1. Days full width on top
2. Guests · Time · Duration on one row below

Consolidate the **two** `.qb-search { grid-template-columns: … }` blocks in `premium.css` (around 10319 and 10694) into one coherent rule set so mobile/desktop do not fight.

Sticky: keep `top: 72px` on desktop; `position: static` on mobile (`max-width: 640px`) as today.

- [ ] **Step 3: Manual sanity**

With app running, hit `/book` and `/book?guests=4&day=1&time=19:00&duration=120`:

- Changing filters updates URL without full reload
- ASAP vs clock times still open popup with correct `initialTime`

- [ ] **Step 4: Commit**

```bash
git add seatiko/apps/web/src/components/quick-book-filters.tsx \
  seatiko/apps/web/src/components/quick-book-search.tsx \
  seatiko/apps/web/src/app/premium.css
git commit -m "$(cat <<'EOF'
feat(web): extract /book filters and fix panel layout hierarchy

EOF
)"
```

---

### Task 6: Locale / theme / tracker note / verify

**Files:**
- Modify: `docs/WEB_PAGES_STATUS.md` (note only)
- Touch messages only if a string overflowed during visual check

- [ ] **Step 1: Tracker note (do not mark Готово)**

Under the `/book` bullet in `docs/WEB_PAGES_STATUS.md`, append a short line such as:

```markdown
  Улучшения UX/визуала (2026-11-16): empty/retry, find+discover, filters — см. `docs/superpowers/specs/2026-11-16-book-page-redesign-design.md`. Статус остаётся **В работе**.
```

Leave checkbox unchecked and table status **В работе**. Summary count stays **4 из 13**.

- [ ] **Step 2: Verification commands**

```bash
cd seatiko/apps/web && npm test -- src/lib/quick-book-partition.test.ts src/lib/venue-availability.test.ts
cd seatiko/apps/web && npx tsc --noEmit
cd seatiko/apps/web && npm run lint
```

Expected: tests pass; tsc clean; lint clean for touched files (fix pre-existing issues elsewhere only if introduced by this work).

- [ ] **Step 3: Browser checklist (agent or human)**

- `/book` dark + light
- RU / EN / RO: hero, filters, discover button, empty copy
- Mobile width ~390px: find row, filters, cards
- Slot → `BookingPopup` still books
- `/book?venue=<id>` still redirects to venue quick book

- [ ] **Step 4: Commit**

```bash
git add docs/WEB_PAGES_STATUS.md seatiko/apps/web/messages/*.json
git commit -m "$(cat <<'EOF'
docs: note /book UX polish pass; keep page in progress

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Visual language vs venue/menu | 3, 4, 5 |
| Empty / error / skeleton | 1, 2, 3 |
| Known-venue search + discover | 4 |
| Filter panel hierarchy | 5 |
| URL sync + `?venue=` redirect | unchanged; sanity in 5–6 |
| No new backend | all |
| Tracker stays В работе | 6 |
| RU/EN/RO | 2, 6 |

## Out of scope reminders

- `GET /api/v1/availability` stays in `BACKEND_TASKS.md` №2
- Do not mark `/book` Готово
- Do not redesign `BookingPopup` internals
