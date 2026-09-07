"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { TableFloorPlan } from "@/components/table-floor-plan";
import { WaitlistPanel } from "@/components/waitlist-panel";
import { useLocale } from "@/components/locale-provider";
import { listZonesFromTables } from "@/lib/floor-zones";
import {
  fetchTables,
  fetchVenue,
  fetchVenuePlaces,
  mediaUrl,
  pickLocale,
  priceLevelLabel,
  type Table,
  type Venue,
  type VenuePlaces,
} from "@/lib/api";

function Stars({ value }: { value: number }) {
  const full = Math.round(Math.max(0, Math.min(5, value)));
  return (
    <span className="venue-stars" aria-label={`${value.toFixed(1)} из 5`}>
      {"★★★★★".slice(0, full)}
      <span>{"★★★★★".slice(full)}</span>
    </span>
  );
}

export default function VenuePage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;
  const { locale } = useLocale();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [places, setPlaces] = useState<VenuePlaces | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError(null);
    });
    Promise.all([
      fetchVenue(venueId),
      fetchTables(venueId),
      fetchVenuePlaces(venueId),
    ])
      .then(([v, t, p]) => {
        if (!active) return;
        setVenue(v);
        setTables(t);
        setPlaces(p);
        setPhotoIdx(0);
      })
      .catch(() => {
        if (active) setError("Ресторан не найден");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [venueId]);

  const photos = useMemo(() => {
    const fromPlaces = places?.photo_urls ?? [];
    if (fromPlaces.length) return fromPlaces;
    if (venue?.photo_urls?.length) return venue.photo_urls;
    if (venue?.image_url) return [venue.image_url];
    return [];
  }, [places, venue]);

  const reviews = places?.reviews?.length ? places.reviews : venue?.reviews ?? [];
  const rating = places?.rating || venue?.rating || 0;
  const reviewCount = places?.review_count || venue?.review_count || reviews.length;
  const freeCount = tables.filter((t) => t.status === "FREE").length;
  const zones = listZonesFromTables(tables);

  if (loading) {
    return (
      <div className="venue-page">
        <SiteHeader variant="solid" />
        <p className="venue-page-loading">Загружаем ресторан…</p>
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="venue-page">
        <SiteHeader variant="solid" />
        <div className="venue-page-empty">
          <h1>{error || "Ресторан не найден"}</h1>
          <Link href="/">На карту</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="venue-page">
      <SiteHeader variant="solid" />
      <div className="venue-page-wrap">
        <div className="venue-hero">
          <div className="venue-hero-media">
            {photos[photoIdx] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(photos[photoIdx])} alt={pickLocale(venue.name, locale)} />
            ) : (
              <div className="venue-hero-fallback" />
            )}
            {photos.length > 1 && (
              <div className="venue-hero-thumbs">
                {photos.slice(0, 6).map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    className={index === photoIdx ? "on" : ""}
                    onClick={() => setPhotoIdx(index)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(url)} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="venue-hero-copy">
            <p className="venue-page-kicker">
              {places?.live_google ? "Google Places · live" : "Фото и отзывы · Google-стиль"}
            </p>
            <h1>{pickLocale(venue.name, locale)}</h1>
            <p className="venue-page-address">⌖ {pickLocale(venue.address, locale)}</p>
            <div className="venue-rating-row">
              <Stars value={rating} />
              <strong>{rating.toFixed(1)}</strong>
              <span>{reviewCount} отзывов</span>
            </div>
            <p className="venue-page-desc">{pickLocale(venue.description, locale)}</p>
            <div className="venue-page-meta">
              <span>{venue.cuisine.slice(0, 3).join(" · ")}</span>
              <span>{priceLevelLabel(venue.price_level)}</span>
              <span>~{venue.average_check} MDL</span>
              <span className={venue.open_now ? "open" : "closed"}>
                {venue.open_now ? "Открыто" : "Закрыто"}
              </span>
            </div>
            <div className="venue-free-pill">
              <b>{freeCount}</b>
              <span>свободных столов сейчас</span>
            </div>
            <div className="venue-page-actions">
              <Link className="venue-cta" href={`/book?venue=${encodeURIComponent(venue.id)}`}>
                Выбрать стол и забронировать
              </Link>
              <Link className="venue-cta ghost" href={`/venues/${venue.id}/menu`}>
                Меню
              </Link>
              <Link className="venue-cta ghost" href="/">
                Назад к карте
              </Link>
            </div>
          </div>
        </div>

        <section className="venue-section">
          <div className="venue-section-head">
            <h2>План зала</h2>
            <p>Живой статус столов · зелёный = свободно</p>
          </div>
          <div className="venue-floor-legend">
            <span>
              <i className="free" /> Свободен
            </span>
            <span>
              <i className="reserved" /> Бронь
            </span>
            <span>
              <i className="occupied" /> Занят
            </span>
            <span>
              <i className="cleaning" /> Уборка
            </span>
          </div>
          <TableFloorPlan
            tables={tables}
            bookHref={`/book?venue=${encodeURIComponent(venue.id)}`}
          />
          <WaitlistPanel venueId={venue.id} zones={zones} />
        </section>

        <section className="venue-section">
          <div className="venue-section-head">
            <h2>Отзывы</h2>
            <p>
              {places?.source === "google"
                ? "Синхронизировано с Google Maps"
                : "Отзывы в формате Google Maps (подключите GOOGLE_PLACES_API_KEY для live)"}
            </p>
          </div>
          <div className="venue-reviews">
            {reviews.map((review, index) => (
              <article key={`${review.author}-${index}`}>
                <header>
                  <div>
                    <strong>{review.author}</strong>
                    {review.relative_time && <small>{review.relative_time}</small>}
                  </div>
                  <Stars value={review.rating} />
                </header>
                <p>{review.text}</p>
                {review.source === "google" && <span className="venue-review-source">Google</span>}
              </article>
            ))}
            {reviews.length === 0 && <p className="venue-page-empty-inline">Отзывов пока нет.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
