"use client";

import { useLocale } from "@/components/locale-provider";
import type { BookingRules } from "@/lib/venue-rules";

/** Lateness / duration rules shown right before the guest confirms a booking. */
export function BookingRulesNote({ rules }: { rules: BookingRules }) {
  const { t } = useLocale();
  return (
    <div className="booking-rules-note">
      <p className="booking-rules-note-lead">
        {rules.hold_minutes > 0
          ? t("res.rule_late_no_warning", { min: rules.hold_minutes })
          : t("res.rule_late_none")}
      </p>
      <p>
        {rules.max_late_arrival_min > rules.hold_minutes
          ? t("res.rule_late_with_warning", { min: rules.max_late_arrival_min })
          : t("res.rule_late_with_warning_same")}
      </p>
    </div>
  );
}
