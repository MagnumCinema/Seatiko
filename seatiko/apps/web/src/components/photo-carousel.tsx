"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";

type PhotoCarouselProps = {
  photos: string[];
  alt: string;
  /** Badges etc. drawn on top of the slides (they must not block swiping). */
  overlay?: ReactNode;
};

/** Swipeable photo carousel (native scroll-snap) with dots below and arrows on desktop. */
export function PhotoCarousel({ photos, alt, overlay }: PhotoCarouselProps) {
  const { t } = useLocale();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = photos.length;

  function goTo(next: number) {
    const track = trackRef.current;
    if (!track || count === 0) return;
    const target = Math.max(0, Math.min(count - 1, next));
    track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" });
  }

  function handleScroll() {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    if (next !== index) setIndex(next);
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    }
  }

  return (
    <div className="photo-carousel">
      <div className="venue-hero-frame photo-carousel-frame">
        {count > 0 ? (
          <div
            ref={trackRef}
            className="photo-carousel-track"
            onScroll={handleScroll}
            onKeyDown={handleKey}
            tabIndex={count > 1 ? 0 : -1}
            role="region"
            aria-roledescription="carousel"
            aria-label={alt}
          >
            {photos.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className="photo-carousel-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={t("venue.photo_n", { n: i + 1 })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={i === 0 ? alt : ""}
                  loading={i === 0 ? "eager" : "lazy"}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="venue-hero-fallback" />
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              className="photo-carousel-arrow prev"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label={t("venue.photo_prev")}
            >
              ‹
            </button>
            <button
              type="button"
              className="photo-carousel-arrow next"
              onClick={() => goTo(index + 1)}
              disabled={index === count - 1}
              aria-label={t("venue.photo_next")}
            >
              ›
            </button>
          </>
        )}

        {overlay}
      </div>

      {count > 1 && (
        <div className="photo-carousel-dots">
          {photos.map((url, i) => (
            <button
              key={`dot-${url}-${i}`}
              type="button"
              className={i === index ? "on" : ""}
              aria-label={t("venue.photo_n", { n: i + 1 })}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
