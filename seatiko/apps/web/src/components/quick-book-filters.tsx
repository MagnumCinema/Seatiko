"use client";

import { useLocale } from "@/components/locale-provider";

const MAX_GUESTS = 20;

type Props = {
  guests: number;
  day: number;
  time: string;
  duration: number;
  daysAhead: number;
  durations: number[];
  timeOptions: string[];
  dayLabel: (offset: number) => string;
  durationLabel: (min: number) => string;
  clock: (d: Date) => string;
  onChange: (patch: Partial<{ guests: number; day: number; time: string; duration: number }>) => void;
};

/** Sticky filter panel for /book: guests, day chips, time (incl. ASAP), duration. */
export function QuickBookFilters({
  guests,
  day,
  time,
  duration,
  daysAhead,
  durations,
  timeOptions,
  dayLabel,
  durationLabel,
  clock,
  onChange,
}: Props) {
  const { t } = useLocale();

  return (
    <section className="qb-search" aria-label={t("qb.search_label")}>
      <div className="qb-field">
        <span className="booking-field-label" id="qb-guests-label">
          {t("res.guests")}
        </span>
        <div className="booking-stepper" role="group" aria-labelledby="qb-guests-label">
          <button
            type="button"
            aria-label={t("res.guests_less")}
            disabled={guests <= 1}
            onClick={() => onChange({ guests: guests - 1 })}
          >
            −
          </button>
          <output aria-live="polite">{guests}</output>
          <button
            type="button"
            aria-label={t("res.guests_more")}
            disabled={guests >= MAX_GUESTS}
            onClick={() => onChange({ guests: guests + 1 })}
          >
            +
          </button>
        </div>
      </div>

      <div className="qb-field qb-field-days">
        <span className="booking-field-label">{t("res.day")}</span>
        <div className="booking-slot-days">
          {Array.from({ length: daysAhead }, (_, offset) => (
            <button
              key={offset}
              type="button"
              className={offset === day ? "on" : ""}
              aria-pressed={offset === day}
              onClick={() => onChange({ day: offset })}
            >
              {dayLabel(offset)}
            </button>
          ))}
        </div>
      </div>

      <label className="qb-field">
        <span className="booking-field-label">{t("res.time")}</span>
        <select
          className="qb-select"
          value={time}
          onChange={(e) => onChange({ time: e.target.value })}
        >
          <option value="asap">{t("qb.time_asap")}</option>
          {timeOptions.map((opt) => {
            const [h, m] = opt.split(":").map(Number);
            return (
              <option key={opt} value={opt}>
                {clock(new Date(2000, 0, 1, h, m))}
              </option>
            );
          })}
        </select>
      </label>

      <div className="qb-field">
        <span className="booking-field-label">{t("res.duration")}</span>
        <div className="booking-slot-days">
          {durations.map((min) => (
            <button
              key={min}
              type="button"
              className={min === duration ? "on" : ""}
              aria-pressed={min === duration}
              onClick={() => onChange({ duration: min })}
            >
              {durationLabel(min)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
