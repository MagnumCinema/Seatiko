# Discover Preference Box Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/discover` preference stepper more attractive and comfortable with a numbered progress rail, larger chips, clearer footer status (plain text), and soft auto-advance after selections.

**Architecture:** Keep the existing hybrid stepper + Ask-for-help layout and `DiscoverPreferences` model. Extract soft-auto-advance scheduling into a pure helper (unit-tested). Upgrade `PreferenceStepper` markup/classes and discover CSS in `premium.css`. Add RU/EN/RO copy for status/hint/continuing strings only.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, existing `site-copy` i18n, CSS in `premium.css`.

**Spec:** `docs/superpowers/specs/2026-09-14-discover-preference-box-polish-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `foodassistant/apps/web/src/lib/soft-advance.ts` | Pure soft-auto-advance rules + status formatting helpers |
| `foodassistant/apps/web/src/lib/soft-advance.test.ts` | Unit tests for schedule/cancel/fire rules |
| `foodassistant/apps/web/src/lib/site-copy.ts` | New discover strings (RU/EN/RO): hint, step status parts, continuing, continue label |
| `foodassistant/apps/web/src/components/discover/preference-stepper.tsx` | Numbered rail, hint, larger chips, footer status, wire soft advance |
| `foodassistant/apps/web/src/app/premium.css` | Stepper / chip / rail / footer visual polish + motion |

Out of scope (do not modify unless tiny spacing only): `guided-chat.tsx`, `active-filters-bar.tsx`, `preference-summary.tsx`, preference encode/filter logic.

---

### Task 1: Soft auto-advance helpers (TDD)

**Files:**
- Create: `foodassistant/apps/web/src/lib/soft-advance.ts`
- Create: `foodassistant/apps/web/src/lib/soft-advance.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `foodassistant/apps/web/src/lib/soft-advance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SOFT_ADVANCE_MS,
  canSoftAdvanceOnTimer,
  planSoftAdvance,
  formatStepperStatus,
} from "./soft-advance";

describe("planSoftAdvance", () => {
  it("schedules 800ms when a step has selections and is not last", () => {
    expect(
      planSoftAdvance({ selectedCount: 1, stepIndex: 0, totalSteps: 5 }),
    ).toEqual({ type: "schedule", ms: SOFT_ADVANCE_MS });
    expect(SOFT_ADVANCE_MS).toBe(800);
  });

  it("cancels when selection count drops to zero", () => {
    expect(
      planSoftAdvance({ selectedCount: 0, stepIndex: 1, totalSteps: 5 }),
    ).toEqual({ type: "cancel" });
  });

  it("cancels on the last step even with selections", () => {
    expect(
      planSoftAdvance({ selectedCount: 2, stepIndex: 4, totalSteps: 5 }),
    ).toEqual({ type: "cancel" });
  });
});

describe("canSoftAdvanceOnTimer", () => {
  it("advances only with selections and not on last step", () => {
    expect(canSoftAdvanceOnTimer({ selectedCount: 1, stepIndex: 2, totalSteps: 5 })).toBe(true);
    expect(canSoftAdvanceOnTimer({ selectedCount: 0, stepIndex: 2, totalSteps: 5 })).toBe(false);
    expect(canSoftAdvanceOnTimer({ selectedCount: 3, stepIndex: 4, totalSteps: 5 })).toBe(false);
  });
});

describe("formatStepperStatus", () => {
  it("builds plain-text status without button chrome", () => {
    expect(
      formatStepperStatus({
        stepLabel: "Step 2 of 5",
        selectedLabel: "1 selected",
        continuingLabel: "Continuing…",
        continuing: false,
      }),
    ).toBe("Step 2 of 5 · 1 selected");

    expect(
      formatStepperStatus({
        stepLabel: "Step 2 of 5",
        selectedLabel: "1 selected",
        continuingLabel: "Continuing…",
        continuing: true,
      }),
    ).toBe("Step 2 of 5 · 1 selected · Continuing…");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd foodassistant/apps/web && npx vitest run src/lib/soft-advance.test.ts
```

Expected: FAIL (module `./soft-advance` not found).

- [ ] **Step 3: Implement minimal helpers**

Create `foodassistant/apps/web/src/lib/soft-advance.ts`:

```ts
export const SOFT_ADVANCE_MS = 800;

export type SoftAdvancePlan =
  | { type: "schedule"; ms: number }
  | { type: "cancel" };

export function planSoftAdvance(input: {
  selectedCount: number;
  stepIndex: number;
  totalSteps: number;
}): SoftAdvancePlan {
  if (input.stepIndex >= input.totalSteps - 1) return { type: "cancel" };
  if (input.selectedCount <= 0) return { type: "cancel" };
  return { type: "schedule", ms: SOFT_ADVANCE_MS };
}

export function canSoftAdvanceOnTimer(input: {
  selectedCount: number;
  stepIndex: number;
  totalSteps: number;
}): boolean {
  return input.selectedCount > 0 && input.stepIndex < input.totalSteps - 1;
}

export function formatStepperStatus(input: {
  stepLabel: string;
  selectedLabel: string;
  continuingLabel: string;
  continuing: boolean;
}): string {
  const base = `${input.stepLabel} · ${input.selectedLabel}`;
  return input.continuing ? `${base} · ${input.continuingLabel}` : base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd foodassistant/apps/web && npx vitest run src/lib/soft-advance.test.ts
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add foodassistant/apps/web/src/lib/soft-advance.ts foodassistant/apps/web/src/lib/soft-advance.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add soft-advance helpers for discover stepper

EOF
)"
```

---

### Task 2: Discover copy (RU / EN / RO)

**Files:**
- Modify: `foodassistant/apps/web/src/lib/site-copy.ts`

- [ ] **Step 1: Add strings to each locale’s `discover` object**

Add these keys beside existing `next` / `back` (keep `next` for now; UI will use `continue` as the primary forward label):

**EN:**

```ts
continue: "Continue",
stepHint: "Pick any that fit. Multi-select is OK.",
stepOf: "Step {n} of {total}",
selectedCount: "{n} selected",
continuing: "Continuing…",
```

**RU:**

```ts
continue: "Далее",
stepHint: "Выберите подходящее. Можно несколько вариантов.",
stepOf: "Шаг {n} из {total}",
selectedCount: "Выбрано: {n}",
continuing: "Продолжаем…",
```

**RO:**

```ts
continue: "Continuă",
stepHint: "Alege ce ți se potrivește. Poți selecta mai multe.",
stepOf: "Pasul {n} din {total}",
selectedCount: "{n} selectate",
continuing: "Continuăm…",
```

- [ ] **Step 2: Add tiny format helpers used by the stepper (same file or soft-advance)**

In `soft-advance.ts` (preferred, keeps `site-copy` data-only), add:

```ts
export function fillTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? ""),
  );
}
```

Add tests in `soft-advance.test.ts`:

```ts
import { fillTemplate } from "./soft-advance";

describe("fillTemplate", () => {
  it("replaces tokens", () => {
    expect(fillTemplate("Step {n} of {total}", { n: 2, total: 5 })).toBe(
      "Step 2 of 5",
    );
  });
});
```

- [ ] **Step 3: Run soft-advance tests**

```bash
cd foodassistant/apps/web && npx vitest run src/lib/soft-advance.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add foodassistant/apps/web/src/lib/site-copy.ts foodassistant/apps/web/src/lib/soft-advance.ts foodassistant/apps/web/src/lib/soft-advance.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add discover stepper status and hint copy

EOF
)"
```

---

### Task 3: Wire PreferenceStepper UI + soft auto-advance

**Files:**
- Modify: `foodassistant/apps/web/src/components/discover/preference-stepper.tsx`

- [ ] **Step 1: Replace stepper markup**

Rewrite the component return structure to match the spec (keep existing `STEPS`, `chipsForStep`, `toggle` logic). Key behaviours:

1. After each successful `toggle`, compute `selectedCount` for the **current** step from the next prefs object.
2. Call `planSoftAdvance({ selectedCount, stepIndex, totalSteps: STEPS.length })`.
3. Maintain a `useRef<number | null>` for the timeout id; clear on unmount and on plan `cancel`.
4. On `schedule`, clear previous timeout then `setTimeout` for `ms`; when it fires, if `canSoftAdvanceOnTimer(...)` still true, `onStepChange(stepIndex + 1)` and clear continuing state.
5. Footer uses **plain text** status via `formatStepperStatus` + `fillTemplate` — never put status inside buttons.
6. Forward button label: `copy.continue` (fallback `copy.next` if types lag).
7. Rail buttons: numbered (`i + 1`), class `on` for current, `done` when `i < stepIndex` (or when that dimension already has picks — prefer `i < stepIndex` for “visited/completed” checkmark).

Skeleton (adapt imports/types to match file):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  BUDGET_LEVELS,
  CUISINE_IDS,
  OCCASION_IDS,
  PRACTICAL_IDS,
  RESTAURANT_TYPE_IDS,
  toggleId,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import {
  canSoftAdvanceOnTimer,
  fillTemplate,
  formatStepperStatus,
  planSoftAdvance,
} from "@/lib/soft-advance";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

const STEPS = [
  "cuisine",
  "restaurantType",
  "budget",
  "occasion",
  "practical",
] as const;

// ... existing StepKey / BudgetChipKey / Props / chipsForStep / toggle helpers ...

function selectedCountForStep(
  prefs: DiscoverPreferences,
  step: (typeof STEPS)[number],
): number {
  switch (step) {
    case "cuisine":
      return prefs.cuisine.length;
    case "restaurantType":
      return prefs.restaurantType.length;
    case "budget":
      return prefs.budget.length;
    case "occasion":
      return prefs.occasion.length;
    case "practical":
      return prefs.practical.length;
  }
}

export function PreferenceStepper({
  stepIndex,
  prefs,
  onPrefsChange,
  onStepChange,
}: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)];
  const [continuing, setContinuing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function clearAdvanceTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setContinuing(false);
  }

  function scheduleAdvance(nextPrefs: DiscoverPreferences, fromIndex: number) {
    const selectedCount = selectedCountForStep(nextPrefs, STEPS[fromIndex]);
    const plan = planSoftAdvance({
      selectedCount,
      stepIndex: fromIndex,
      totalSteps: STEPS.length,
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (plan.type === "cancel") {
      setContinuing(false);
      return;
    }
    setContinuing(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setContinuing(false);
      if (
        canSoftAdvanceOnTimer({
          selectedCount: selectedCountForStep(nextPrefs, STEPS[fromIndex]),
          stepIndex: fromIndex,
          totalSteps: STEPS.length,
        })
      ) {
        onStepChange(fromIndex + 1);
      }
    }, plan.ms);
  }

  // In toggle handlers: build nextPrefs, onPrefsChange(nextPrefs), scheduleAdvance(nextPrefs, stepIndex)

  const selectedCount = selectedCountForStep(prefs, step);
  const status = formatStepperStatus({
    stepLabel: fillTemplate(copy.stepOf, {
      n: stepIndex + 1,
      total: STEPS.length,
    }),
    selectedLabel: fillTemplate(copy.selectedCount, { n: selectedCount }),
    continuingLabel: copy.continuing,
    continuing,
  });

  return (
    <div className="discover-stepper">
      <ol className="discover-stepper-rail" aria-label="Steps">
        {STEPS.map((key, i) => (
          <li key={key}>
            <button
              type="button"
              className={[
                i === stepIndex ? "on" : "",
                i < stepIndex ? "done" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                clearAdvanceTimer();
                onStepChange(i);
              }}
            >
              <span className="discover-stepper-num" aria-hidden>
                {i + 1}
              </span>
              <span className="discover-stepper-rail-label">{copy.steps[key]}</span>
              {i < stepIndex ? (
                <span className="discover-stepper-check" aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>

      <div className="discover-stepper-body">
        <h2>{copy.steps[step]}</h2>
        <p className="discover-stepper-hint">{copy.stepHint}</p>
        <div className="discover-chips" role="group">
          {/* chipsForStep map — add check mark span when selected */}
        </div>
      </div>

      <div className="discover-stepper-nav">
        <button
          type="button"
          className="btn btn-outline"
          disabled={stepIndex === 0}
          onClick={() => {
            clearAdvanceTimer();
            onStepChange(stepIndex - 1);
          }}
        >
          {copy.back}
        </button>
        <p className="discover-stepper-status" aria-live="polite">
          {status}
        </p>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            clearAdvanceTimer();
            if (stepIndex < STEPS.length - 1) onStepChange(stepIndex + 1);
          }}
          disabled={stepIndex >= STEPS.length - 1}
        >
          {copy.continue}
        </button>
      </div>
    </div>
  );
}
```

Notes for implementer:

- Refactor existing `toggle(id)` so it returns/uses the next prefs object and calls `scheduleAdvance`.
- Manual Continue on last step stays disabled (summary CTAs handle map) — matches current “Next” disabled-on-last behaviour.
- Clear the timer when jumping via the rail.

- [ ] **Step 2: Typecheck / lint the stepper file**

```bash
cd foodassistant/apps/web && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors related to `discover` copy keys / soft-advance imports. If `site-copy` typings are inferred from the object literal, adding keys in all three locales is enough.

- [ ] **Step 3: Re-run unit tests**

```bash
cd foodassistant/apps/web && npx vitest run src/lib/soft-advance.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add foodassistant/apps/web/src/components/discover/preference-stepper.tsx foodassistant/apps/web/src/lib/site-copy.ts
git commit -m "$(cat <<'EOF'
feat(web): polish discover stepper rail, chips wiring, soft advance

EOF
)"
```

---

### Task 4: CSS polish for rail, chips, box, footer

**Files:**
- Modify: `foodassistant/apps/web/src/app/premium.css` (discover stepper section ~`.discover-stepper` through `.discover-chip.on`)

- [ ] **Step 1: Replace / extend discover stepper styles**

Update classes to match the new markup. Keep theme tokens (`--fa-*`). Include at least:

```css
.discover-stepper {
  display: grid;
  gap: 1.1rem;
  padding: 1.45rem 1.45rem 1.35rem;
  border: 1px solid var(--fa-border);
  border-radius: 20px;
  background:
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--fa-surface-2) 88%, var(--fa-surface)),
      var(--fa-surface)
    );
  box-shadow: 0 18px 40px color-mix(in srgb, var(--fa-text) 12%, transparent);
}

.discover-stepper-rail {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.discover-stepper-rail button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--fa-border);
  border-radius: 999px;
  color: var(--fa-muted);
  background: color-mix(in srgb, var(--fa-bg) 35%, transparent);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s, transform 0.12s;
}

.discover-stepper-rail button:hover {
  color: var(--fa-text);
  border-color: color-mix(in srgb, var(--fa-gold) 40%, transparent);
}

.discover-stepper-rail button.on {
  color: #1a1510;
  border-color: transparent;
  background: var(--fa-gold);
}

.discover-stepper-rail button.done:not(.on) {
  color: var(--fa-text);
  border-color: color-mix(in srgb, var(--fa-green) 35%, transparent);
}

.discover-stepper-num {
  display: inline-grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fa-text) 10%, transparent);
  font-size: 0.68rem;
  font-weight: 750;
}

.discover-stepper-rail button.on .discover-stepper-num {
  background: color-mix(in srgb, #1a1510 14%, transparent);
}

.discover-stepper-body h2 {
  margin: 0 0 0.35rem;
}

.discover-stepper-hint {
  margin: 0 0 1rem;
  color: var(--fa-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

.discover-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.discover-chip {
  min-height: 2.5rem;
  padding: 0.55rem 1rem;
  border-radius: 999px;
  font-size: 0.92rem;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s;
}

.discover-chip:active {
  transform: scale(0.98);
}

.discover-chip.on {
  background: var(--fa-gold);
  border-color: var(--fa-gold);
  color: #1a1510;
  font-weight: 650;
}

.discover-stepper-nav {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--fa-border);
}

.discover-stepper-status {
  margin: 0;
  text-align: center;
  color: var(--fa-muted);
  font-size: 0.78rem;
  font-weight: 550;
  line-height: 1.35;
}

@media (max-width: 640px) {
  .discover-stepper-rail-label {
    /* optional: hide long labels on very small screens, keep numbers */
  }
  .discover-stepper-nav {
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      "status status"
      "back continue";
  }
  .discover-stepper-status { grid-area: status; }
  .discover-stepper-nav .btn:first-child { grid-area: back; }
  .discover-stepper-nav .btn:last-child { grid-area: continue; }
}

.discover-layout {
  /* bump gap slightly if stepper grew taller */
  gap: 1.65rem;
  align-items: stretch;
}
```

Remove obsolete `.discover-stepper-tabs` rules once markup no longer uses them (or leave as unused — prefer delete to avoid drift).

- [ ] **Step 2: Rebuild web container so localhost picks up CSS**

```bash
cd /Users/cristianchilat/WebstormProjects/Virtual-restaurant- && docker compose build web && docker compose up -d web
```

Expected: web image rebuilt and container restarted.

- [ ] **Step 3: Manual check list (on `/discover`)**

1. Light + dark theme: rail, chips, status text all readable.
2. Select a cuisine chip → status shows Continuing… → advances after ~800ms.
3. Rapid multi-select resets timer; stays on step until pause.
4. Deselect all → timer cancels; no advance.
5. Last step never auto-advances.
6. Status is plain text, not inside Back/Continue.
7. Ask-for-help still usable beside/below the box.

- [ ] **Step 4: Commit**

```bash
git add foodassistant/apps/web/src/app/premium.css
git commit -m "$(cat <<'EOF'
style(web): polish discover stepper rail, chips, and footer

EOF
)"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run unit tests**

```bash
cd foodassistant/apps/web && npx vitest run src/lib/soft-advance.test.ts src/lib/discover-preferences.test.ts
```

Expected: PASS.

- [ ] **Step 2: Typecheck**

```bash
cd foodassistant/apps/web && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Confirm git log shows the feature commits**

```bash
git log --oneline -6
```

Expected: commits for soft-advance helpers, copy, stepper wiring, CSS polish.

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Numbered horizontal progress rail + done/current/future | Task 3 + 4 |
| Title + hint under rail | Task 2 + 3 |
| Footer Back · plain-text status · Continue | Task 2 + 3 + 4 |
| Larger chips + clearer selected + press feedback | Task 3 + 4 |
| Soft auto-advance 800ms, reset, cancel at 0, no last-step advance | Task 1 + 3 |
| Theme-aware surfaces | Task 4 |
| RU/EN/RO strings | Task 2 |
| Unit tests for advance rules | Task 1 |
| No chat/filters/summary/model rewrite | Explicit non-touch in file map |

## Self-review notes

- No TBD placeholders.
- `planSoftAdvance` / `canSoftAdvanceOnTimer` / `formatStepperStatus` / `fillTemplate` names are consistent across tasks.
- Timer uses frozen prefs snapshot from the toggle that scheduled it; rail/Back/Continue clear the timer to avoid stale advances.
