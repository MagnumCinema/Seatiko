"use client";

import Link from "next/link";
import type { DiscoverPreferences } from "@/lib/discover-preferences";
import { encodePreferences } from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type BudgetChipKey = "budget1" | "budget2" | "budget3";

type Props = {
  prefs: DiscoverPreferences;
  onShowMap: () => void;
};

export function PreferenceSummary({ prefs, onShowMap }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const labels: string[] = [
    ...prefs.cuisine.map((id) => copy.chips[id]),
    ...prefs.restaurantType.map((id) =>
      copy.chips[id === "fast_food" ? "fast_food" : id],
    ),
    ...prefs.budget.map((b) => copy.chips[`budget${b}` as BudgetChipKey]),
    ...prefs.occasion.map((id) => copy.chips[id]),
    ...prefs.practical.map((id) => copy.chips[id]),
  ];

  return (
    <div className="discover-summary">
      <div>
        <span className="eyebrow">{copy.yourPicks}</span>
        <div className="discover-summary-picks">
          {labels.length === 0 ? (
            <span className="muted">—</span>
          ) : (
            labels.map((label) => (
              <span key={label} className="discover-chip on">
                {label}
              </span>
            ))
          )}
        </div>
      </div>
      <div className="discover-summary-actions">
        <Link href="/#map" className="btn btn-outline">
          {copy.browseMap}
        </Link>
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
