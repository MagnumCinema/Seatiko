"use client";

import Link from "next/link";
import {
  mediaUrl,
  pickLocale,
  priceLevelLabel,
  type Venue,
} from "@/lib/api";
import { venueBookingHref } from "@/lib/booking-link";
import type { VenueAvailability } from "@/lib/venue-availability";
import { useLocale } from "@/components/locale-provider";

type Props = {
  venue: Venue;
  availability: VenueAvailability;
  laterToday: VenueAvailability | null;
  guests: number;
  durationMin: number;
  dayLabel: string;
  target: Date | null;
  cuisineLabels: Record<string, string>;
  onPickSlot: (timeIso: string, durationMin: number) => void;
  onPickOtherDay: (durationMin: number) => void;
};

export function QuickBookResultCard({
  venue,
  availability,
  laterToday,
  guests,
  durationMin,
  dayLabel,
  target,
  cuisineLabels,
  onPickSlot,
  onPickOtherDay,
}: Props) {
  const { locale, t } = useLocale();
  const shown = availability.slots.length ? availability : laterToday;
  const slots = shown?.slots ?? [];
  const name = pickLocale(venue.name, locale);
  const photo = venue.photo_urls?.[0] || venue.image_url;
  const cuisine = venue.cuisine
    .slice(0, 2)
    .map((c) => cuisineLabels[c] ?? c)
    .join(" · ");
  const clock = (d: Date) => d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const durationLabel = (min: number) =>
    t("res.duration_hours", { h: (min / 60).toLocaleString(locale, { maximumFractionDigits: 1 }) });

  return (
    <article
      className={`qb-card${availability.exact ? " exact" : ""}${slots.length ? "" : " muted"}`}
    >
      <Link href={`/venues/${venue.id}`} className="qb-card-photo" tabIndex={-1} aria-hidden="true">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(photo)} alt="" loading="lazy" />
        ) : null}
      </Link>
      <div className="qb-card-body">
        <div className="qb-card-title">
          <h3>
            <Link href={`/venues/${venue.id}`}>{name}</Link>
          </h3>
          <span className="qb-card-rating">★ {venue.rating.toFixed(1)}</span>
        </div>
        <p className="qb-card-meta">
          {[cuisine, priceLevelLabel(venue.price_level), pickLocale(venue.address, locale)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p
          className={`qb-card-status${availability.exact ? " exact" : ""}${slots.length ? "" : " none"}`}
        >
          {!availability.fits
            ? t("qb.card_small", { guests })
            : availability.exact
              ? t("qb.exact", { time: clock(availability.exact.start) })
              : availability.slots.length
                ? target
                  ? t("qb.nearest")
                  : t("qb.earliest")
                : slots.length
                  ? t("qb.later_today", { time: target ? clock(target) : "" })
                  : t("qb.day_full", { day: dayLabel.toLowerCase() })}
        </p>
        <div className="qb-slots" role="group" aria-label={t("qb.slots_label", { venue: name })}>
          {slots.map((slot) => {
            const isExact = availability.exact?.start.getTime() === slot.start.getTime();
            return (
              <button
                key={slot.start.toISOString()}
                type="button"
                className={`chip${isExact ? " is-active" : ""}`}
                onClick={() => onPickSlot(slot.start.toISOString(), shown?.durationMin ?? durationMin)}
              >
                {clock(slot.start)}
              </button>
            );
          })}
        </div>
        {!availability.fits ? (
          <Link className="btn btn--link qb-card-action" href={venueBookingHref(venue.id, { intent: "event" })}>
            {t("qb.other_event")} →
          </Link>
        ) : !slots.length ? (
          <button
            type="button"
            className="btn btn--link qb-card-action"
            onClick={() => onPickOtherDay(availability.durationMin)}
          >
            {t("qb.pick_other_day")} →
          </button>
        ) : null}
        {slots.length && shown && shown.durationMin !== durationMin ? (
          <p className="qb-card-note">
            {t("qb.duration_capped", { duration: durationLabel(shown.durationMin) })}
          </p>
        ) : null}
      </div>
    </article>
  );
}
