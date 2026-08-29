"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { WebBooking } from "@/components/web-booking";
import { useLocale } from "@/components/locale-provider";
import { fetchVenues, pickLocale, type Venue } from "@/lib/api";

function BookChooser() {
  const { locale } = useLocale();
  const [venues, setVenues] = useState<Venue[]>([]);

  useEffect(() => {
    fetchVenues("city-balti")
      .then(setVenues)
      .catch(() => setVenues([]));
  }, []);

  return (
    <div className="web-book-chooser">
      <h1>Выберите ресторан</h1>
      <p>Откройте заведение и забронируйте стол прямо на сайте — полноценная страница, не телефон</p>
      <ul className="web-book-chooser-list">
        {venues.map((v) => (
          <li key={v.id}>
            <Link href={`/book?venue=${encodeURIComponent(v.id)}`}>
              <strong>{pickLocale(v.name, locale)}</strong>
              <span>
                ★ {v.rating} · {v.free_tables} своб. · ~{v.average_check} MDL
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="web-book-chooser-alt">
        Или откройте ресторан с <Link href="/">карты</Link>
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
  return (
    <div className="book-page web-book-page">
      <SiteHeader variant="solid" />
      <Suspense fallback={<div className="web-book-loading">Loading…</div>}>
        <BookInner />
      </Suspense>
    </div>
  );
}
