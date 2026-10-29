"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { WebBooking } from "@/components/web-booking";
import { useLocale } from "@/components/locale-provider";
import { fetchVenues, pickLocale, type Venue } from "@/lib/api";

function BookChooser() {
  const { locale, t } = useLocale();
  const [venues, setVenues] = useState<Venue[]>([]);

  useEffect(() => {
    fetchVenues("city-balti")
      .then(setVenues)
      .catch(() => setVenues([]));
  }, []);

  return (
    <div className="web-book-chooser venue-page-wrap">
      <p className="venue-page-kicker">{t("venue.book")}</p>
      <h1>Выберите ресторан</h1>
      <p>
        Откройте заведение и забронируйте стол прямо на сайте
      </p>
      <ul className="web-book-chooser-list">
        {venues.map((v) => (
          <li key={v.id}>
            <Link href={`/book?venue=${encodeURIComponent(v.id)}`}>
              <strong>{pickLocale(v.name, locale)}</strong>
              <span>
                ★ {v.rating} · {v.free_tables} · ~{v.average_check} MDL
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="web-book-chooser-alt">
        Или откройте ресторан с <Link href="/">{t("nav.map").toLowerCase()}</Link>
      </p>
    </div>
  );
}

function BookInner() {
  const params = useSearchParams();
  const venueId = useMemo(() => params.get("venue")?.trim() || "", [params]);
  if (venueId) return <WebBooking venueId={venueId} />;
  return <BookChooser />;
}

export default function BookPage() {
  const { t } = useLocale();
  return (
    <div className="venue-page book-page web-book-page">
      <SiteHeader variant="solid" />
      <Suspense fallback={<div className="venue-page-loading">{t("venue.loading")}</div>}>
        <BookInner />
      </Suspense>
    </div>
  );
}
