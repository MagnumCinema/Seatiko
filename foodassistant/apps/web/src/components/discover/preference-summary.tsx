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

export function PreferenceSummary({ prefs, onShowMap, onBrowseMap }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const picks: { key: string; label: string }[] = [
    ...prefs.cuisine.map((id) => ({
      key: `cuisine-${id}`,
      label: copy.chips[id],
    })),
    ...prefs.restaurantType.map((id) => ({
      key: `type-${id}`,
      label: copy.chips[id === "fast_food" ? "fast_food" : id],
    })),
    ...prefs.budget.map((b) => ({
      key: `budget-${b}`,
      label: copy.chips[`budget${b}` as BudgetChipKey],
    })),
    ...prefs.occasion.map((id) => ({
      key: `occasion-${id}`,
      label: copy.chips[id],
    })),
    ...prefs.practical.map((id) => ({
      key: `practical-${id}`,
      label: copy.chips[id],
    })),
  ];

  return (
    <div className="discover-summary">
      <div>
        <span className="eyebrow">{copy.yourPicks}</span>
        <div className="discover-summary-picks">
          {picks.length === 0 ? (
            <span className="muted">—</span>
          ) : (
            picks.map(({ key, label }) => (
              <span key={key} className="discover-chip on">
                {label}
              </span>
            ))
          )}
        </div>
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
