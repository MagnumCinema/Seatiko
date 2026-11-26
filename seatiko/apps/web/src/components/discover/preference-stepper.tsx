"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  BUDGET_MDL_MAX,
  BUDGET_MDL_MIN,
  BUDGET_MDL_STEP,
  BUDGET_PRESET_IDS,
  CUISINE_IDS,
  OCCASION_IDS,
  PRACTICAL_IDS,
  RESTAURANT_TYPE_IDS,
  budgetMaxOnly,
  budgetPresetRange,
  formatBudgetAmount,
  matchBudgetPreset,
  toggleId,
  type BudgetPresetId,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { fillTemplate } from "@/lib/soft-advance";
import { getSiteCopy } from "@/lib/site-copy";
import { useCurrency } from "@/components/currency-provider";
import { useLocale } from "@/components/locale-provider";

const STEPS = [
  "occasion",
  "restaurantType",
  "cuisine",
  "budget",
  "practical",
] as const;

const CHIP_COLLAPSE_ROWS = 2;

type StepKey = (typeof STEPS)[number];

type Chip = { id: string; label: string; selected: boolean };

type Props = {
  stepIndex: number;
  prefs: DiscoverPreferences;
  mapVisible?: boolean;
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

function chipIdsForStep(step: StepKey): readonly string[] {
  switch (step) {
    case "cuisine":
      return CUISINE_IDS;
    case "restaurantType":
      return RESTAURANT_TYPE_IDS;
    case "occasion":
      return OCCASION_IDS;
    case "practical":
      return PRACTICAL_IDS;
    case "budget":
      return [];
  }
}

function chipLabel(
  copy: ReturnType<typeof getSiteCopy>["discover"],
  id: string,
): string {
  return copy.chips[id as keyof typeof copy.chips] ?? id;
}

/** Height that keeps only the first `maxRows` chip rows visible, or null if everything fits. */
export function collapseHeightForChipRows(
  container: HTMLElement,
  maxRows: number,
): number | null {
  const chips = Array.from(
    container.querySelectorAll<HTMLElement>(":scope > .discover-chip"),
  );
  if (chips.length === 0 || maxRows < 1) return null;

  // Use viewport rects so height is relative to the chips container, not offsetParent.
  const containerTop = container.getBoundingClientRect().top;
  const rows = chips.map((chip) => {
    const rect = chip.getBoundingClientRect();
    return {
      top: rect.top - containerTop,
      bottom: rect.bottom - containerTop,
    };
  });

  const rowTops: number[] = [];
  for (const row of rows) {
    if (!rowTops.some((t) => Math.abs(t - row.top) <= 1)) rowTops.push(row.top);
  }
  rowTops.sort((a, b) => a - b);
  if (rowTops.length <= maxRows) return null;

  const lastVisibleTop = rowTops[maxRows - 1]!;
  let bottom = 0;
  for (const row of rows) {
    if (row.top <= lastVisibleTop + 1) {
      bottom = Math.max(bottom, row.bottom);
    }
  }
  return Math.ceil(bottom);
}

export function PreferenceStepper({
  stepIndex,
  prefs,
  mapVisible = false,
  onPrefsChange,
  onStepChange,
  onGoToMap,
}: Props) {
  const { locale } = useLocale();
  const { currency } = useCurrency();
  const copy = getSiteCopy(locale).discover;
  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)] as StepKey;
  const [showMore, setShowMore] = useState(false);
  const [collapseHeight, setCollapseHeight] = useState<number | null>(null);
  const [budgetThumbTip, setBudgetThumbTip] = useState(false);
  const [prevStepIndex, setPrevStepIndex] = useState(stepIndex);
  const chipsRef = useRef<HTMLDivElement | null>(null);

  if (prevStepIndex !== stepIndex) {
    setPrevStepIndex(stepIndex);
    setShowMore(false);
    setCollapseHeight(null);
  }

  useLayoutEffect(() => {
    const el = chipsRef.current;
    if (!el || step === "budget") {
      setCollapseHeight(null);
      return;
    }

    let measuring = false;
    const measure = () => {
      if (measuring) return;
      measuring = true;
      const prevMax = el.style.maxHeight;
      const prevOverflow = el.style.overflow;
      el.style.maxHeight = "none";
      el.style.overflow = "visible";
      const next = collapseHeightForChipRows(el, CHIP_COLLAPSE_ROWS);
      el.style.maxHeight = prevMax;
      el.style.overflow = prevOverflow;
      setCollapseHeight((prev) => (prev === next ? prev : next));
      measuring = false;
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step, locale, showMore]);

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

  const chipIds = chipIdsForStep(step);
  const expanded = showMore;
  const needsShowMore = collapseHeight != null;

  function chipsFor(ids: readonly string[]): Chip[] {
    return ids.map((id) => ({
      id,
      label: chipLabel(copy, id),
      selected: isSelected(id),
    }));
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

  const budgetMaxVal = prefs.budget?.max ?? BUDGET_MDL_MAX;
  const budgetCurrencyLabel = copy.budgetCurrencies[currency];
  const budgetSpan = BUDGET_MDL_MAX - BUDGET_MDL_MIN || 1;
  const budgetTipLeft =
    ((budgetMaxVal - BUDGET_MDL_MIN) / budgetSpan) * 100;

  const chipsCollapsed = needsShowMore && !expanded;

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
              <div className="discover-budget-head">
                <p className="discover-budget-value" aria-live="polite">
                  {prefs.budget
                    ? fillTemplate(copy.budgetMaxReadout, {
                        max: formatBudgetAmount(prefs.budget.max, currency),
                        currency: budgetCurrencyLabel,
                      })
                    : copy.budgetAny}
                </p>
              </div>
              <div
                className={[
                  "discover-budget-range-wrap",
                  prefs.budget == null ? "is-idle" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="discover-budget-bound" aria-hidden>
                  {formatBudgetAmount(BUDGET_MDL_MIN, currency)}{" "}
                  {budgetCurrencyLabel}
                </span>
                <div
                  className="discover-budget-range"
                  role="group"
                  aria-label={copy.steps.budget}
                >
                  <span className="discover-budget-track" aria-hidden />
                  <input
                    type="range"
                    className="discover-budget-thumb discover-budget-thumb-max"
                    min={BUDGET_MDL_MIN}
                    max={BUDGET_MDL_MAX}
                    step={BUDGET_MDL_STEP}
                    value={budgetMaxVal}
                    aria-label={`Maximum (${budgetCurrencyLabel})`}
                    aria-valuetext={
                      prefs.budget == null
                        ? copy.budgetAny
                        : `${formatBudgetAmount(budgetMaxVal, currency)} ${budgetCurrencyLabel}`
                    }
                    onPointerEnter={() => setBudgetThumbTip(true)}
                    onPointerLeave={() => setBudgetThumbTip(false)}
                    onFocus={() => setBudgetThumbTip(true)}
                    onBlur={() => setBudgetThumbTip(false)}
                    onChange={(e) => {
                      setBudgetThumbTip(true);
                      onPrefsChange({
                        ...prefs,
                        budget: budgetMaxOnly(Number(e.target.value)),
                      });
                    }}
                  />
                  {budgetThumbTip ? (
                    <span
                      className="discover-budget-tooltip"
                      style={{ left: `${budgetTipLeft}%` }}
                      aria-hidden
                    >
                      {formatBudgetAmount(budgetMaxVal, currency)}{" "}
                      {budgetCurrencyLabel}
                    </span>
                  ) : null}
                </div>
                <span className="discover-budget-bound" aria-hidden>
                  {formatBudgetAmount(BUDGET_MDL_MAX, currency)}{" "}
                  {budgetCurrencyLabel}
                </span>
              </div>
              <div
                className="discover-chips discover-budget-presets"
                role="group"
                aria-label={copy.budgetHint}
              >
                {BUDGET_PRESET_IDS.map((id) => {
                  const on = matchBudgetPreset(prefs.budget) === id;
                  const range = budgetPresetRange(id as BudgetPresetId);
                  const label = range
                    ? fillTemplate(copy.budgetPresetUnder, {
                        max: formatBudgetAmount(range.max, currency),
                        currency: budgetCurrencyLabel,
                      })
                    : copy.budgetPresets[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`chip discover-chip${on ? " is-active" : ""}`}
                      aria-pressed={on}
                      onClick={() =>
                        onPrefsChange({
                          ...prefs,
                          budget: budgetPresetRange(id),
                        })
                      }
                    >
                      <span className="discover-chip-label">{label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`chip discover-chip${prefs.budget == null ? " is-active" : ""}`}
                  aria-pressed={prefs.budget == null}
                  onClick={() => onPrefsChange({ ...prefs, budget: null })}
                >
                  <span className="discover-chip-label">{copy.budgetAny}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                ref={chipsRef}
                className={[
                  "discover-chips",
                  chipsCollapsed ? "is-collapsed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="group"
                style={
                  chipsCollapsed
                    ? { maxHeight: collapseHeight!, overflow: "hidden" }
                    : undefined
                }
              >
                {chipsFor(chipIds).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={`chip discover-chip${chip.selected ? " is-active" : ""}`}
                    aria-pressed={chip.selected}
                    onClick={() => toggle(chip.id)}
                  >
                    <span className="discover-chip-label">{chip.label}</span>
                  </button>
                ))}
              </div>
              {needsShowMore ? (
                <div className="discover-show-more-row">
                  <button
                    type="button"
                    className="btn btn--link discover-show-more"
                    onClick={() => setShowMore((v) => !v)}
                    aria-expanded={expanded}
                  >
                    {expanded ? copy.showLess : copy.showMore}
                  </button>
                </div>
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
            className="btn btn--ghost btn--md discover-stepper-back"
            onClick={() => onStepChange(stepIndex - 1)}
          >
            {copy.back}
          </button>
        ) : null}
        <p className="discover-stepper-status" aria-live="polite">
          {status}
        </p>
        <div className="discover-stepper-nav-actions">
          {mapVisible && stepIndex < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn btn--secondary btn--md discover-stepper-map"
              onClick={() => onGoToMap?.()}
            >
              {copy.goToMap}
            </button>
          ) : null}
          {stepIndex < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn btn--primary btn--md discover-stepper-continue"
              onClick={() => onStepChange(stepIndex + 1)}
            >
              {copy.continue}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--md discover-stepper-continue"
              onClick={() => onGoToMap?.()}
            >
              {copy.seePlaces}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
