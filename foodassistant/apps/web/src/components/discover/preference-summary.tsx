"use client";

import type { DiscoverPreferences } from "@/lib/discover-preferences";
import { encodePreferences } from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type BudgetChipKey = "budget1" | "budget2" | "budget3";

type Props = {
  prefs: DiscoverPreferences;
  onShowMap: () => void;
  onBrowseMap?: () => void;
};

type PickGroup = {
  key: string;
  label: string;
  chips: { key: string; label: string }[];
};

export function PreferenceSummary({ prefs, onShowMap, onBrowseMap }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;

  const groups: PickGroup[] = [
    {
      key: "cuisine",
      label: copy.steps.cuisine,
      chips: prefs.cuisine.map((id) => ({
        key: `cuisine-${id}`,
        label: copy.chips[id],
      })),
    },
    {
      key: "restaurantType",
      label: copy.steps.restaurantType,
      chips: prefs.restaurantType.map((id) => ({
        key: `type-${id}`,
        label: copy.chips[id === "fast_food" ? "fast_food" : id],
      })),
    },
    {
      key: "budget",
      label: copy.steps.budget,
      chips: prefs.budget.map((b) => ({
        key: `budget-${b}`,
        label: copy.chips[`budget${b}` as BudgetChipKey],
      })),
    },
    {
      key: "occasion",
      label: copy.steps.occasion,
      chips: prefs.occasion.map((id) => ({
        key: `occasion-${id}`,
        label: copy.chips[id],
      })),
    },
    {
      key: "practical",
      label: copy.steps.practical,
      chips: prefs.practical.map((id) => ({
        key: `practical-${id}`,
        label: copy.chips[id],
      })),
    },
  ].filter((group) => group.chips.length > 0);

  return (
    <div className="discover-summary">
      <div className="discover-summary-main">
        <span className="eyebrow">{copy.yourPicks}</span>
        {groups.length === 0 ? (
          <p className="discover-summary-empty muted">—</p>
        ) : (
          <div className="discover-summary-groups">
            {groups.map((group) => (
              <div key={group.key} className="discover-summary-group">
                <span className="discover-summary-group-label">{group.label}</span>
                <div className="discover-summary-group-chips">
                  {group.chips.map(({ key, label }) => (
                    <span key={key} className="discover-chip on">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="discover-summary-actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => onBrowseMap?.()}
        >
          {copy.browseMap}
        </button>
        <button type="button" className="btn btn-gold" onClick={onShowMap}>
          {copy.showMap}
        </button>
      </div>
    </div>
  );
}

export function buildMapHref(prefs: DiscoverPreferences): string {
  const qs = encodePreferences(prefs);
  return qs ? `/?${qs}#map` : "/#map";
}
