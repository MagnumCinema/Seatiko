"use client";

import {
  BUDGET_LEVELS,
  CUISINE_IDS,
  OCCASION_IDS,
  PRACTICAL_IDS,
  RESTAURANT_TYPE_IDS,
  toggleId,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { fillTemplate } from "@/lib/soft-advance";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

const STEPS = [
  "cuisine",
  "restaurantType",
  "budget",
  "occasion",
  "practical",
] as const;

type StepKey = (typeof STEPS)[number];

type BudgetChipKey = "budget1" | "budget2" | "budget3";

type Props = {
  stepIndex: number;
  prefs: DiscoverPreferences;
  onPrefsChange: (prefs: DiscoverPreferences) => void;
  onStepChange: (index: number) => void;
};

function selectedCountForStep(
  prefs: DiscoverPreferences,
  step: StepKey,
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
  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)] as StepKey;

  function chipsForStep(): { id: string; label: string; selected: boolean }[] {
    switch (step) {
      case "cuisine":
        return CUISINE_IDS.map((id) => ({
          id,
          label: copy.chips[id],
          selected: prefs.cuisine.includes(id),
        }));
      case "restaurantType":
        return RESTAURANT_TYPE_IDS.map((id) => ({
          id,
          label: copy.chips[id === "fast_food" ? "fast_food" : id],
          selected: prefs.restaurantType.includes(id),
        }));
      case "budget":
        return BUDGET_LEVELS.map((level) => {
          const key = `budget${level}` as BudgetChipKey;
          return {
            id: String(level),
            label: copy.chips[key],
            selected: prefs.budget.includes(level),
          };
        });
      case "occasion":
        return OCCASION_IDS.map((id) => ({
          id,
          label: copy.chips[id],
          selected: prefs.occasion.includes(id),
        }));
      case "practical":
        return PRACTICAL_IDS.map((id) => ({
          id,
          label: copy.chips[id],
          selected: prefs.practical.includes(id),
        }));
    }
  }

  function toggle(id: string) {
    let nextPrefs: DiscoverPreferences;
    switch (step) {
      case "cuisine":
        nextPrefs = {
          ...prefs,
          cuisine: toggleId(prefs.cuisine, id as (typeof prefs.cuisine)[number]),
        };
        break;
      case "restaurantType":
        nextPrefs = {
          ...prefs,
          restaurantType: toggleId(
            prefs.restaurantType,
            id as (typeof prefs.restaurantType)[number],
          ),
        };
        break;
      case "budget": {
        const level = Number(id) as 1 | 2 | 3;
        nextPrefs = {
          ...prefs,
          budget: toggleId(prefs.budget, level),
        };
        break;
      }
      case "occasion":
        nextPrefs = {
          ...prefs,
          occasion: toggleId(prefs.occasion, id as (typeof prefs.occasion)[number]),
        };
        break;
      case "practical":
        nextPrefs = {
          ...prefs,
          practical: toggleId(
            prefs.practical,
            id as (typeof prefs.practical)[number],
          ),
        };
        break;
    }
    onPrefsChange(nextPrefs);
  }

  const selectedCount = selectedCountForStep(prefs, step);
  const status = `${fillTemplate(copy.stepOf, {
    n: stepIndex + 1,
    total: STEPS.length,
  })} · ${fillTemplate(copy.selectedCount, { n: selectedCount })}`;

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
              onClick={() => onStepChange(i)}
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
          {chipsForStep().map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`discover-chip ${chip.selected ? "on" : ""}`}
              aria-pressed={chip.selected}
              onClick={() => toggle(chip.id)}
            >
              {chip.label}
              {chip.selected ? (
                <span className="discover-stepper-check" aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="discover-stepper-nav">
        <button
          type="button"
          className="btn btn-outline"
          disabled={stepIndex === 0}
          onClick={() => onStepChange(stepIndex - 1)}
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
