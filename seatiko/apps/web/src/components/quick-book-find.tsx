"use client";

import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { SearchIcon, SparklesIcon } from "@/components/venue-icons";

type Props = {
  value: string;
  onChange: (text: string) => void;
};

/** Known-venue search + discover shortcut for /book. */
export function QuickBookFind({ value, onChange }: Props) {
  const { t } = useLocale();

  return (
    <div className="catalog-search-row qb-find">
      <div className="catalog-search-wrap">
        <SearchIcon />
        <input
          type="search"
          className="catalog-search-input"
          placeholder={t("qb.find_placeholder")}
          value={value}
          maxLength={80}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("qb.find_label")}
        />
        {value ? (
          <button
            type="button"
            className="catalog-search-clear"
            onClick={() => onChange("")}
            aria-label={t("qb.find_clear")}
          >
            ✕
          </button>
        ) : null}
      </div>
      <Link href="/discover" className="catalog-discover-btn">
        <SparklesIcon />
        <span>{t("qb.discover")}</span>
      </Link>
    </div>
  );
}
