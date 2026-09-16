"use client";

import { useEffect, useState } from "react";
import {
  BUDGET_MDL_MAX,
  BUDGET_MDL_MIN,
  BUDGET_MDL_STEP,
  BUDGET_PRESET_IDS,
  CUISINE_MORE,
  CUISINE_PRIMARY,
  OCCASION_MORE,
  OCCASION_PRIMARY,
  PRACTICAL_MORE,
  PRACTICAL_PRIMARY,
  RESTAURANT_TYPE_MORE,
  RESTAURANT_TYPE_PRIMARY,
  budgetPresetRange,
  matchBudgetPreset,
  normalizeBudgetRange,
  toggleId,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { chipIcon } from "@/lib/discover-chip-icons";
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

type Chip = { id: string; label: string; selected: boolean };

type Props = {
  stepIndex: number;
  prefs: DiscoverPreferences;
  onPrefsChange: (prefs: DiscoverPreferences) => void;
  onStepChange: (index: number) => void;
  onGoToMap?: () => void;
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
      return prefs.budget ? 1 : 0;
    case "occasion":
      return prefs.occasion.length;
    case "practical":
      return prefs.practical.length;
  }
}

function chipLabel(
  copy: ReturnType<typeof getSiteCopy>["discover"],
  id: string,
): string {
  return copy.chips[id as keyof typeof copy.chips] ?? id;
}

export function PreferenceStepper({
  stepIndex,
  prefs,
  onPrefsChange,
  onStepChange,
  onGoToMap,
}: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)] as StepKey;
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    setShowMore(false);
  }, [stepIndex]);

  function primaryAndMore(): { primary: string[]; more: string[] } {
    switch (step) {
      case "cuisine":
        return { primary: CUISINE_PRIMARY, more: CUISINE_MORE };
      case "restaurantType":
        return { primary: RESTAURANT_TYPE_PRIMARY, more: RESTAURANT_TYPE_MORE };
      case "occasion":
        return { primary: OCCASION_PRIMARY, more: OCCASION_MORE };
      case "practical":
        return { primary: PRACTICAL_PRIMARY, more: PRACTICAL_MORE };
      case "budget":
        return { primary: [], more: [] };
    }
  }

  function isSelected(id: string): boolean {
    switch (step) {
      case "cuisine":
        return prefs.cuisine.includes(id as (typeof prefs.cuisine)[number]);
      case "restaurantType":
        return prefs.restaurantType.includes(
          id as (typeof prefs.restaurantType)[number],
        );
      case "occasion":
        return prefs.occasion.includes(id as (typeof prefs.occasion)[number]);
      case "practical":
        return prefs.practical.includes(id as (typeof prefs.practical)[number]);
      case "budget":
        return false;
    }
  }

  const { primary, more } = primaryAndMore();
  const expanded = showMore;

  function chipsFor(ids: string[]): Chip[] {
    return ids.map((id) => ({
      id,
      label: chipLabel(copy, id),
      selected: isSelected(id),
    }));
  }

  function toggle(id: string) {
    if (more.includes(id)) setShowMore(true);
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
      case "budget":
        return;
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
        <p className="discover-stepper-hint">
          {step === "budget" ? copy.budgetHint : copy.stepHint}
        </p>

        <div className="discover-stepper-panel">
          {step === "budget" ? (
            <div className="discover-budget">
              <div
                className="discover-budget-range"
                role="group"
                aria-label={copy.steps.budget}
              >
                <input
                  type="range"
                  className="discover-budget-thumb discover-budget-thumb-min"
                  min={BUDGET_MDL_MIN}
                  max={BUDGET_MDL_MAX}
                  step={BUDGET_MDL_STEP}
                  value={prefs.budget?.min ?? BUDGET_MDL_MIN}
                  onChange={(e) => {
                    const min = Number(e.target.value);
                    const max = prefs.budget?.max ?? BUDGET_MDL_MAX;
                    onPrefsChange({
                      ...prefs,
                      budget: normalizeBudgetRange({
                        min,
                        max: Math.max(min, max),
                      }),
                    });
                  }}
                />
                <input
                  type="range"
                  className="discover-budget-thumb discover-budget-thumb-max"
                  min={BUDGET_MDL_MIN}
                  max={BUDGET_MDL_MAX}
                  step={BUDGET_MDL_STEP}
                  value={prefs.budget?.max ?? BUDGET_MDL_MAX}
                  onChange={(e) => {
                    const max = Number(e.target.value);
                    const min = prefs.budget?.min ?? BUDGET_MDL_MIN;
                    onPrefsChange({
                      ...prefs,
                      budget: normalizeBudgetRange({
                        min: Math.min(min, max),
                        max,
                      }),
                    });
                  }}
                />
              </div>
              <p className="discover-budget-value">
                {prefs.budget
                  ? fillTemplate(copy.budgetReadout, {
                      min: String(prefs.budget.min),
                      max: String(prefs.budget.max),
                    })
                  : copy.budgetAny}
              </p>
              <div
                className="discover-chips discover-budget-presets"
                role="group"
              >
                {BUDGET_PRESET_IDS.map((id) => {
                  const on = matchBudgetPreset(prefs.budget) === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`discover-chip ${on ? "on" : ""}`}
                      aria-pressed={on}
                      onClick={() =>
                        onPrefsChange({
                          ...prefs,
                          budget: budgetPresetRange(id),
                        })
                      }
                    >
                      <span className="discover-chip-icon" aria-hidden>
                        {chipIcon(id)}
                      </span>
                      <span>{copy.budgetPresets[id]}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`discover-chip ${prefs.budget == null ? "on" : ""}`}
                  aria-pressed={prefs.budget == null}
                  onClick={() => onPrefsChange({ ...prefs, budget: null })}
                >
                  <span className="discover-chip-icon" aria-hidden>
                    {chipIcon("any")}
                  </span>
                  <span>{copy.budgetAny}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="discover-chips" role="group">
                {chipsFor(primary).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={`discover-chip ${chip.selected ? "on" : ""}`}
                    aria-pressed={chip.selected}
                    onClick={() => toggle(chip.id)}
                  >
                    <span className="discover-chip-icon" aria-hidden>
                      {chipIcon(chip.id)}
                    </span>
                    <span className="discover-chip-label">{chip.label}</span>
                    {chip.selected ? (
                      <span className="discover-stepper-check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              {expanded ? (
                <div className="discover-chips discover-chips-more" role="group">
                  {chipsFor(more).map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={`discover-chip ${chip.selected ? "on" : ""}`}
                      aria-pressed={chip.selected}
                      onClick={() => toggle(chip.id)}
                    >
                      <span className="discover-chip-icon" aria-hidden>
                        {chipIcon(chip.id)}
                      </span>
                      <span className="discover-chip-label">{chip.label}</span>
                      {chip.selected ? (
                        <span className="discover-stepper-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
              {more.length > 0 ? (
                <button
                  type="button"
                  className="discover-show-more"
                  onClick={() => setShowMore((v) => !v)}
                  aria-expanded={expanded}
                >
                  {expanded ? copy.showLess : copy.showMore}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div
        className={[
          "discover-stepper-nav",
          stepIndex === 0 ? "is-first" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {stepIndex > 0 ? (
          <button
            type="button"
            className="btn btn-outline discover-stepper-back"
            onClick={() => onStepChange(stepIndex - 1)}
          >
            {copy.back}
          </button>
        ) : null}
        <p className="discover-stepper-status" aria-live="polite">
          {status}
        </p>
        {stepIndex < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn-outline discover-stepper-continue"
            onClick={() => onStepChange(stepIndex + 1)}
          >
            {copy.continue}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-gold discover-stepper-continue"
            onClick={() => onGoToMap?.()}
          >
            {copy.seePlaces}
          </button>
        )}
      </div>
    </div>
  );
}
