"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  encodePreferences,
  type DiscoverPreferences,
} from "@/lib/discover-preferences";
import { getSiteCopy } from "@/lib/site-copy";
import { useLocale } from "@/components/locale-provider";

type Props = {
  prefs: DiscoverPreferences;
  onEdit?: () => void;
  onClear?: () => void;
};

export function ActiveFiltersBar({ prefs, onEdit, onClear }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const router = useRouter();
  const qs = encodePreferences(prefs);
  const editHref = qs ? `/discover?${qs}` : "/discover";

  return (
    <div className="discover-filters-bar" role="status">
      <strong>{copy.filtersActive}</strong>
      <div className="discover-filters-actions">
        {onEdit ? (
          <button type="button" className="btn btn-outline" onClick={onEdit}>
            {copy.filtersEdit}
          </button>
        ) : (
          <Link href={editHref} className="btn btn-outline">
            {copy.filtersEdit}
          </Link>
        )}
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
  );
}
