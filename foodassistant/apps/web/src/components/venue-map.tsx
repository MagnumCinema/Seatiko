"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  fetchVenues,
  pickLocale,
  priceLevelLabel,
  type Venue,
} from "@/lib/api";
import { useLocale } from "@/components/locale-provider";

function mapPosition(venue: Venue, venues: Venue[]) {
  const lats = venues.map((item) => item.lat).filter(Number.isFinite);
  const lngs = venues.map((item) => item.lng).filter(Number.isFinite);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.004);
  const lngSpan = Math.max(maxLng - minLng, 0.006);

  return {
    left: `${12 + ((venue.lng - minLng) / lngSpan) * 76}%`,
    top: `${14 + (1 - (venue.lat - minLat) / latSpan) * 68}%`,
  };
}

export function VenueMap({ compact = false }: { compact?: boolean }) {
  const { locale } = useLocale();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchVenues()
      .then((items) => {
        if (!active) return;
        setVenues(items);
        setSelectedId(items[0]?.id ?? null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => venues.find((venue) => venue.id === selectedId) ?? venues[0],
    [selectedId, venues],
  );

  return (
    <div className={`venue-map-shell ${compact ? "compact" : ""}`}>
      <div className="venue-map-canvas" aria-label="Карта ресторанов Бельц">
        <div className="map-river" />
        <div className="map-road map-road-one" />
        <div className="map-road map-road-two" />
        <div className="map-road map-road-three" />
        <div className="map-park"><span>Central Park</span></div>
        <div className="map-city-label">BĂLȚI</div>
        {venues.map((venue, index) => {
          const position = mapPosition(venue, venues);
          const active = venue.id === selected?.id;
          return (
            <button
              key={venue.id}
              type="button"
              className={`venue-map-pin ${active ? "active" : ""}`}
              style={position}
              onClick={() => setSelectedId(venue.id)}
              aria-label={pickLocale(venue.name, locale)}
            >
              <span>{index + 1}</span>
            </button>
          );
        })}
        <div className="venue-map-controls" aria-hidden>
          <span>+</span><span>−</span>
        </div>
        <div className="venue-map-status">
          <i /> {loading ? "Загружаем места" : `${venues.length} заведений онлайн`}
        </div>
      </div>

      <div className="venue-map-panel">
        <div className="venue-map-panel-head">
          <div>
            <span className="eyebrow">Рядом с вами</span>
            <h3>{selected ? pickLocale(selected.name, locale) : "Рестораны Бельц"}</h3>
          </div>
          {selected && <span className="venue-rating">★ {selected.rating.toFixed(1)}</span>}
        </div>

        {selected ? (
          <>
            <p className="venue-map-address">⌖ {pickLocale(selected.address, locale)}</p>
            <div className="venue-map-meta">
              <span>{selected.cuisine.slice(0, 2).join(" · ")}</span>
              <span>{priceLevelLabel(selected.price_level)}</span>
              <span>~{selected.average_check} MDL</span>
            </div>
            <div className="venue-availability">
              <span><i /> Открыто сейчас</span>
              <strong>{selected.free_tables} свободных столов</strong>
            </div>
          </>
        ) : (
          <p className="venue-map-address">После публикации рестораны автоматически появятся здесь.</p>
        )}

        <div className="venue-map-list">
          {venues.slice(0, compact ? 3 : 4).map((venue, index) => (
            <button
              type="button"
              key={venue.id}
              className={venue.id === selected?.id ? "active" : ""}
              onClick={() => setSelectedId(venue.id)}
            >
              <b>{index + 1}</b>
              <span>{pickLocale(venue.name, locale)}</span>
              <small>{venue.free_tables} мест</small>
            </button>
          ))}
        </div>

        <Link href="/demo" className="map-primary-action">
          Открыть карту и выбрать стол <span>→</span>
        </Link>
      </div>
    </div>
  );
}
