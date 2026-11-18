"use client";

import Link from "next/link";
import type { EmptyKind } from "@/lib/quick-book-partition";
import { useLocale } from "@/components/locale-provider";

type Props = {
  kind: EmptyKind | null;
  failed: boolean;
  guests: number;
  timeIsAsap: boolean;
  canNextDay: boolean;
  onRetry: () => void;
  onClearSearch: () => void;
  onTryAsap: () => void;
  onTryNextDay: () => void;
};

export function QuickBookEmpty({ kind, failed, guests, timeIsAsap, canNextDay, onRetry, onClearSearch, onTryAsap, onTryNextDay }: Props) {
  const { t } = useLocale();

  if (failed) {
    return (
      <div className="qb-empty qb-empty-error" role="alert">
        <p>{t("common.error")}</p>
        <div>
          <button type="button" className="venue-cta venue-cta-outline" onClick={onRetry}>
            {t("qb.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!kind) return null;

  if (kind === "search-miss") {
    return (
      <div className="qb-empty">
        <p>{t("qb.nothing_body")}</p>
        <div>
          <button type="button" className="venue-cta venue-cta-outline" onClick={onClearSearch}>
            {t("qb.find_clear")}
          </button>
          <Link href="/discover" className="venue-cta venue-cta-outline">
            {t("qb.discover")}
          </Link>
        </div>
      </div>
    );
  }

  if (kind === "too-small-all") {
    return (
      <div className="qb-empty">
        <p>{t("qb.none_group", { guests })}</p>
      </div>
    );
  }

  return (
    <div className="qb-empty">
      <p>{t("qb.none_body")}</p>
      <div>
        {!timeIsAsap ? (
          <button type="button" className="venue-cta venue-cta-outline" onClick={onTryAsap}>
            {t("qb.try_asap")}
          </button>
        ) : null}
        {canNextDay ? (
          <button type="button" className="venue-cta venue-cta-outline" onClick={onTryNextDay}>
            {t("qb.try_next_day")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
