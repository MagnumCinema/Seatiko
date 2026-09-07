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
};

export function ActiveFiltersBar({ prefs }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).discover;
  const router = useRouter();
  const qs = encodePreferences(prefs);
  const editHref = qs ? `/discover?${qs}` : "/discover";

  return (
    <div className="discover-filters-bar" role="status">
      <strong>{copy.filtersActive}</strong>
      <div className="discover-filters-actions">
        <Link href={editHref} className="btn btn-outline">
          {copy.filtersEdit}
        </Link>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => router.push("/#map")}
        >
          {copy.filtersClear}
        </button>
      </div>
    </div>
  );
}
