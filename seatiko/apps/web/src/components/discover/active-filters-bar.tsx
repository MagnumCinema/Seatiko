"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  encodePreferences,
  formatBudgetAmount,
  type BudgetCurrencyId,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { fillTemplate } from "@/lib/soft-advance";
import { getSiteCopy } from "@/lib/site-copy";
import { useCurrency } from "@/components/currency-provider";
import { useLocale } from "@/components/locale-provider";

type FilterChip = {
  key: string;
  label: string;
  soft?: boolean;
  remove?: (prefs: DiscoverPreferences) => DiscoverPreferences;
};

type FilterGroup = {
  key: string;
  label: string;
  chips: FilterChip[];
};

type StepKey =
  | "cuisine"
  | "restaurantType"
  | "budget"
  | "occasion"
  | "practical";

type Props = {
  prefs: DiscoverPreferences;
  onPrefsChange?: (prefs: DiscoverPreferences) => void;
  onEdit?: () => void;
  onClear?: () => void;
  /** Under the preference stepper: hide redundant Edit. */
  placement?: "under-stepper" | "map";
  /** Show groups for steps before this index (passed steps). */
  stepIndex?: number;
};

function chipLabel(
  copy: ReturnType<typeof getSiteCopy>["discover"],
  id: string,
): string {
  return copy.chips[id as keyof typeof copy.chips] ?? id;
}

function anyChip(
  copy: ReturnType<typeof getSiteCopy>["discover"],
  key: string,
): FilterChip {
  return {
    key: `${key}:any`,
    label: `${copy.filterAny} · ${copy.filterAnyHint}`,
    soft: true,
  };
}

function buildGroups(
  prefs: DiscoverPreferences,
  copy: ReturnType<typeof getSiteCopy>["discover"],
  currency: BudgetCurrencyId,
  opts: { includeEmptyThrough?: number; onlySelected?: boolean },
): FilterGroup[] {
  const groups: FilterGroup[] = [];
  const through = opts.includeEmptyThrough ?? -1;

  function shouldShow(stepKey: StepKey, stepIdx: number, hasValue: boolean) {
    if (opts.onlySelected) return hasValue;
    return stepIdx < through || hasValue;
  }

  const occasionHas = prefs.occasion.length > 0;
  if (shouldShow("occasion", 0, occasionHas)) {
    groups.push({
      key: "occasion",
      label: copy.steps.occasion,
      chips: occasionHas
        ? prefs.occasion.map((id) => ({
            key: `occasion:${id}`,
            label: chipLabel(copy, id),
            remove: (p) => ({
              ...p,
              occasion: p.occasion.filter((x) => x !== id),
            }),
          }))
        : [anyChip(copy, "occasion")],
    });
  }

  const typeHas = prefs.restaurantType.length > 0;
  if (shouldShow("restaurantType", 1, typeHas)) {
    groups.push({
      key: "restaurantType",
      label: copy.steps.restaurantType,
      chips: typeHas
        ? prefs.restaurantType.map((id) => ({
            key: `type:${id}`,
            label: chipLabel(copy, id),
            remove: (p) => ({
              ...p,
              restaurantType: p.restaurantType.filter((x) => x !== id),
            }),
          }))
        : [anyChip(copy, "restaurantType")],
    });
  }

  const cuisineHas = prefs.cuisine.length > 0;
  if (shouldShow("cuisine", 2, cuisineHas)) {
    groups.push({
      key: "cuisine",
      label: copy.steps.cuisine,
      chips: cuisineHas
        ? prefs.cuisine.map((id) => ({
            key: `cuisine:${id}`,
            label: chipLabel(copy, id),
            remove: (p) => ({
              ...p,
              cuisine: p.cuisine.filter((x) => x !== id),
            }),
          }))
        : [anyChip(copy, "cuisine")],
    });
  }

  const budgetHas = prefs.budget != null;
  if (shouldShow("budget", 3, budgetHas)) {
    groups.push({
      key: "budget",
      label: copy.steps.budget,
      chips: budgetHas
        ? [
            {
              key: "budget",
              label: fillTemplate(copy.budgetMaxReadout, {
                max: formatBudgetAmount(prefs.budget!.max, currency),
                currency: copy.budgetCurrencies[currency],
              }),
              remove: (p) => ({ ...p, budget: null }),
            },
          ]
        : [anyChip(copy, "budget")],
    });
  }

  const practicalHas = prefs.practical.length > 0;
  if (shouldShow("practical", 4, practicalHas)) {
    groups.push({
      key: "practical",
      label: copy.steps.practical,
      chips: practicalHas
        ? prefs.practical.map((id) => ({
            key: `practical:${id}`,
            label: chipLabel(copy, id),
            remove: (p) => ({
              ...p,
              practical: p.practical.filter((x) => x !== id),
            }),
          }))
        : [anyChip(copy, "practical")],
    });
  }

  return groups;
}

export function ActiveFiltersBar({
  prefs,
  onPrefsChange,
  onEdit,
  onClear,
  placement = "map",
  stepIndex,
}: Props) {
  const { locale } = useLocale();
  const { currency } = useCurrency();
  const copy = getSiteCopy(locale).discover;
  const router = useRouter();
  const underStepper = placement === "under-stepper";
  const groups = buildGroups(
    prefs,
    copy,
    currency,
    underStepper
      ? { includeEmptyThrough: stepIndex ?? 0 }
      : { onlySelected: true },
  );
  const qs = encodePreferences(prefs);
  const editHref = qs ? `/discover?${qs}` : "/discover";

  if (groups.length === 0) return null;

  function applyPrefs(next: DiscoverPreferences) {
    if (onPrefsChange) {
      onPrefsChange(next);
      return;
    }
    const nextQs = encodePreferences(next);
    router.replace(nextQs ? `/?${nextQs}#map` : "/#map");
  }

  return (
    <div
      className={[
        "discover-filters-bar",
        underStepper ? "under-stepper" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      <div className="discover-filters-head">
        <div>
          <strong>{copy.filtersActive}</strong>
          {underStepper ? (
            <p className="discover-filters-note">{copy.summaryHint}</p>
          ) : null}
        </div>
        <div className="discover-filters-actions">
          {!underStepper && onEdit ? (
            <button type="button" className="btn btn-outline" onClick={onEdit}>
              {copy.filtersEdit}
            </button>
          ) : null}
          {!underStepper && !onEdit ? (
            <Link href={editHref} className="btn btn-outline">
              {copy.filtersEdit}
            </Link>
          ) : null}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              if (onClear) onClear();
              else router.push("/#map");
            }}
          >
            {copy.filtersClear}
          </button>
        </div>
      </div>

      <div className="discover-filters-groups">
        {groups.map((group) => (
          <div key={group.key} className="discover-filters-group">
            <span className="discover-filters-group-label">{group.label}</span>
            <ul className="discover-filters-chips">
              {group.chips.map((chip) => (
                <li key={chip.key}>
                  {chip.soft || !chip.remove ? (
                    <span
                      className="discover-filter-chip soft"
                      aria-label={chip.label}
                    >
                      <span>{chip.label}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="discover-filter-chip"
                      onClick={() => applyPrefs(chip.remove!(prefs))}
                      aria-label={`${copy.filtersClear}: ${chip.label}`}
                    >
                      <span>{chip.label}</span>
                      <span className="discover-filter-chip-x" aria-hidden>
                        ×
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
