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
    switch (step) {
      case "cuisine":
        onPrefsChange({
          ...prefs,
          cuisine: toggleId(prefs.cuisine, id as (typeof prefs.cuisine)[number]),
        });
        break;
      case "restaurantType":
        onPrefsChange({
          ...prefs,
          restaurantType: toggleId(
            prefs.restaurantType,
            id as (typeof prefs.restaurantType)[number],
          ),
        });
        break;
      case "budget": {
        const level = Number(id) as 1 | 2 | 3;
        onPrefsChange({
          ...prefs,
          budget: toggleId(prefs.budget, level),
        });
        break;
      }
      case "occasion":
        onPrefsChange({
          ...prefs,
          occasion: toggleId(prefs.occasion, id as (typeof prefs.occasion)[number]),
        });
        break;
      case "practical":
        onPrefsChange({
          ...prefs,
          practical: toggleId(
            prefs.practical,
            id as (typeof prefs.practical)[number],
          ),
        });
        break;
    }
  }

  return (
    <div className="discover-stepper">
      <ol className="discover-stepper-tabs" aria-label="Steps">
        {STEPS.map((key, i) => (
          <li key={key}>
            <button
              type="button"
              className={i === stepIndex ? "on" : ""}
              onClick={() => onStepChange(i)}
            >
              {copy.steps[key]}
            </button>
          </li>
        ))}
      </ol>
      <h2>{copy.steps[step]}</h2>
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
          </button>
        ))}
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
        <button
          type="button"
          className="btn btn-outline"
          disabled={stepIndex >= STEPS.length - 1}
          onClick={() => onStepChange(stepIndex + 1)}
        >
          {copy.next}
        </button>
      </div>
    </div>
  );
}
