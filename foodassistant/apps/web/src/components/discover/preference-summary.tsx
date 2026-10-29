"use client";

import type { DiscoverPreferences } from "@/lib/discover-preferences";
import { encodePreferences } from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type Props = {
  canReset?: boolean;
  onReset: () => void;
};

export function PreferenceSummary({ canReset = false, onReset }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;

  return (
    <div className="discover-summary">
      <div className="discover-summary-main">
        <span className="eyebrow">{copy.yourPicks}</span>
        <p className="discover-summary-note">{copy.summaryHint}</p>
      </div>
      <div className="discover-summary-actions">
        <button
          type="button"
          className="btn btn-outline"
          onClick={onReset}
          disabled={!canReset}
        >
          {copy.reset}
        </button>
      </div>
    </div>
  );
}

export function buildMapHref(prefs: DiscoverPreferences): string {
  const qs = encodePreferences(prefs);
  return qs ? `/?${qs}#map` : "/#map";
}
