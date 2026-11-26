"use client";

import { useLocale, type MessageKey } from "@/components/locale-provider";
import type { BookingRules } from "@/lib/venue-rules";

type Row = { label: MessageKey; value: string };

/** Guest-facing summary of the venue's booking rules (set by the owner in the cabinet). */
export function VenueBookingRules({
  rules,
  allowPreorder,
  compact = false,
}: {
  rules: BookingRules;
  allowPreorder: boolean;
  /** Inside the booking popup: just the list, no heading. */
  compact?: boolean;
}) {
  const { locale, t } = useLocale();
  /** Same wording as the duration chips in the booking window: "1,5 ч", "45 мин". */
  const duration = (min: number) =>
    min % 30 === 0 && min >= 60
      ? t("res.duration_hours", { h: (min / 60).toLocaleString(locale, { maximumFractionDigits: 1 }) })
      : t("res.duration_minutes", { min });
  const rows: Row[] = [
    {
      label: "venue.rules_late_no_warning",
      value:
        rules.hold_minutes > 0
          ? t("venue.rules_up_to_min", { min: rules.hold_minutes })
          : t("venue.rules_not_allowed"),
    },
    {
      label: "venue.rules_late_with_warning",
      value: t("venue.rules_up_to_min", { min: rules.max_late_arrival_min }),
    },
    {
      label: "venue.rules_visit",
      value: t("venue.rules_duration_choice", { max: duration(rules.max_visit_duration_min) }),
    },
    {
      label: "venue.rules_seat_early",
      value:
        rules.session_start_before_min > 0
          ? t("venue.rules_before_min", { min: rules.session_start_before_min })
          : t("venue.rules_at_booking_time"),
    },
    {
      label: "venue.rules_walkin_release",
      value:
        rules.release_before_min > 0
          ? t("venue.rules_before_min", { min: rules.release_before_min })
          : t("venue.rules_walkin_at_booking_time"),
    },
    {
      label: "venue.rules_preorder",
      value: allowPreorder
        ? t("venue.rules_preorder_until", { min: rules.preorder_lead_min })
        : t("venue.rules_unavailable"),
    },
  ];
  const list = (
    <dl className={compact ? "venue-booking-rules-list compact" : "venue-booking-rules-list"}>
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{t(row.label)}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
  if (compact) return list;
  return (
    <section className="venue-booking-rules" aria-labelledby="venue-booking-rules-title">
      <div className="venue-booking-rules-head">
        <h3 id="venue-booking-rules-title">{t("venue.rules_title")}</h3>
        <p>{t("venue.rules_subtitle")}</p>
      </div>
      {list}
    </section>
  );
}
