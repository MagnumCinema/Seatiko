"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { VenueMenu } from "@/components/venue-menu";
import { useLocale } from "@/components/locale-provider";
import {
  fetchMenu,
  fetchVenue,
  pickLocale,
  type MenuItem,
  type Venue,
} from "@/lib/api";
import { venueBookingHref } from "@/lib/booking-link";

export default function VenueMenuPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const venueId = params.id;
  const isPreorder = searchParams.get("preorder") === "1";
  const tableParam = searchParams.get("table");
  const { locale } = useLocale();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) setLoading(true);
    });
    Promise.all([
      fetchVenue(venueId),
      fetchMenu(venueId).catch(() => [] as MenuItem[]),
    ])
      .then(([v, items]) => {
        if (!alive) return;
        setVenue(v);
        setMenu(items);
      })
      .catch(() => {
        if (alive) setError("Ресторан не найден");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [venueId]);

  if (loading) {
    return (
      <div className="menu-page">
        <SiteHeader variant="solid" />
        <p className="menu-page-loading">Загружаем меню…</p>
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="menu-page">
        <SiteHeader variant="solid" />
        <div className="menu-page-empty">
          <h1>{error || "Ресторан не найден"}</h1>
          <Link href="/">На карту</Link>
        </div>
      </div>
    );
  }

  const name = pickLocale(venue.name, locale);

  return (
    <div className="menu-page">
      <SiteHeader variant="solid" />
      <div className="menu-page-wrap">
        <div className="menu-page-top">
          <Link href={`/venues/${venue.id}`} className="menu-page-back">
            ← {name}
          </Link>
          <Link
            href={venueBookingHref(venue.id)}
            className="menu-page-book"
          >
            Забронировать
          </Link>
        </div>

        {isPreorder && (
          <div className="menu-preorder-banner">
            <div className="menu-preorder-content">
              <span className="menu-preorder-icon">✨</span>
              <div>
                <strong>Предзаказ блюд к вашему визиту</strong>
                <p>
                  Ознакомьтесь с меню ресторана
                  {tableParam ? ` для столика №${tableParam}` : ""}. Вы можете выбрать любимые блюда заранее, чтобы к вашему приходу всё было готово.
                </p>
              </div>
            </div>
            <Link
              href={`/venues/${encodeURIComponent(venue.id)}`}
              className="btn btn-gold btn-sm menu-preorder-return-btn"
            >
              Вернуться к брони стола →
            </Link>
          </div>
        )}

        <header className="menu-page-hero">
          <p className="menu-page-kicker">Меню ресторана</p>
          <h1>{name}</h1>
          <p className="menu-page-sub">
            Цены в MDL · то же меню, что в приложении
          </p>
        </header>

        <VenueMenu items={menu} locale={locale} />

        <div className="menu-page-actions">
          <Link
            className="venue-cta"
            href={`/venues/${encodeURIComponent(venue.id)}#venue-floor`}
          >
            Выбрать стол и забронировать
          </Link>
          <Link className="venue-cta ghost" href={`/venues/${venue.id}`}>
            К ресторану
          </Link>
        </div>
      </div>
    </div>
  );
}
