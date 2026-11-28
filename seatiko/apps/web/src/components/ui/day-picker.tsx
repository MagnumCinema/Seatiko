"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { ScrollerFade } from "@/components/ui/scroller-fade";
import {
  ROLLING_WEEKS,
  addDays,
  calendarView,
  dayCellState,
  dayKey,
  monthRangeTitle,
  readPickerMode,
  startOfDay,
  weekdayHeads,
  writePickerMode,
  type PickerMode,
} from "@/lib/date-picker";

/** Cards mode never lists more than this many days (the calendar covers the rest). */
const MAX_CARD_DAYS = 30;

type DayPickerProps = {
  /** Field label ("День"). */
  label: string;
  min: Date;
  max: Date;
  value: Date | null;
  onChange: (day: Date) => void;
  /** The venue is closed that day (struck through, not pickable). */
  isClosed: (day: Date) => boolean;
  /** Free tables that day (green dot); omit when availability is not known. */
  hasFree?: (day: Date) => boolean;
  /** Legend for the green dot (default "free tables"). */
  dotLabel?: string;
  className?: string;
};

/**
 * Day choice with a "Cards | Calendar" switch: a swipeable row of day cards, or a
 * month grid with open / closed markers. The mode is remembered in this browser
 * (seatiko_date_picker_mode) for the booking popup and the banquet form alike.
 */
export function DayPicker({ label, min, max, value, onChange, isClosed, hasFree, dotLabel, className = "" }: DayPickerProps) {
  const { locale, t } = useLocale();
  const [mode, setMode] = useState<PickerMode>(() => readPickerMode());
  const [anchor, setAnchor] = useState<Date>(() => value ?? min);
  const today = useMemo(() => startOfDay(new Date()), []);

  function switchMode(next: PickerMode) {
    setMode(next);
    writePickerMode(next);
  }

  const cardDays = useMemo(() => {
    const days: Date[] = [];
    for (let day = startOfDay(min); day.getTime() <= max.getTime() && days.length < MAX_CARD_DAYS; day = addDays(day, 1)) {
      days.push(day);
    }
    return days;
  }, [min, max]);

  const view = calendarView(min, max, anchor);
  const heads = useMemo(() => weekdayHeads(locale), [locale]);
  const fullDate = (d: Date) => d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

  function cardLabel(day: Date) {
    const offset = Math.round((day.getTime() - today.getTime()) / 86_400_000);
    if (offset === 0) return t("res.today");
    if (offset === 1) return t("res.tomorrow");
    const withMonth = day.getMonth() !== today.getMonth();
    return day.toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      ...(withMonth ? { month: "short" as const } : {}),
    });
  }

  return (
    <div className={`day-picker ${className}`.trim()}>
      <div className="day-picker-head">
        <span className="booking-field-label">{label}</span>
        <div className="seg day-picker-mode" role="group" aria-label={label}>
          <button
            type="button"
            className={`seg-item${mode === "cards" ? " is-active" : ""}`}
            aria-pressed={mode === "cards"}
            onClick={() => switchMode("cards")}
          >
            {t("picker.cards")}
          </button>
          <button
            type="button"
            className={`seg-item${mode === "calendar" ? " is-active" : ""}`}
            aria-pressed={mode === "calendar"}
            onClick={() => switchMode("calendar")}
          >
            {t("picker.calendar")}
          </button>
        </div>
      </div>

      {mode === "cards" ? (
        <ScrollerFade trackClassName="day-picker-cards" ariaLabel={label} activeKey={value ? dayKey(value) : null}>
          {cardDays.map((day) => {
            const cell = dayCellState({ date: day, min, max, today, selected: value, isClosed, hasFree });
            return (
              <button
                key={cell.key}
                type="button"
                className={`chip${cell.selected ? " is-active" : ""}${cell.closed ? " is-closed" : ""}`}
                aria-pressed={cell.selected}
                aria-label={`${fullDate(day)}${cell.closed ? ` · ${t("picker.closed")}` : ""}`}
                disabled={!cell.enabled}
                title={cell.closed ? t("picker.closed") : undefined}
                onClick={() => onChange(day)}
              >
                {cardLabel(day)}
              </button>
            );
          })}
        </ScrollerFade>
      ) : (
        <div className="day-picker-cal">
          <div className={`day-picker-cal-head${view.paged ? "" : " is-static"}`}>
            <button
              type="button"
              className="btn btn--ghost btn--sm btn--icon"
              aria-label={t("picker.prev_month")}
              disabled={!view.canPrev}
              onClick={() => setAnchor(addDays(view.weeks[0][0], -ROLLING_WEEKS * 7))}
            >
              ‹
            </button>
            <strong aria-live="polite">{monthRangeTitle(view.fromMonth, view.toMonth, locale)}</strong>
            <button
              type="button"
              className="btn btn--ghost btn--sm btn--icon"
              aria-label={t("picker.next_month")}
              disabled={!view.canNext}
              onClick={() => setAnchor(addDays(view.weeks[0][0], ROLLING_WEEKS * 7))}
            >
              ›
            </button>
          </div>
          <div className="day-picker-grid" role="grid" aria-label={label}>
            <div className="day-picker-row is-heads" role="row">
              {heads.map((head) => (
                <span key={head} role="columnheader" className="day-picker-wd">
                  {head}
                </span>
              ))}
            </div>
            {view.weeks.map((week) => (
              <div key={dayKey(week[0])} className="day-picker-row" role="row">
                {week.map((day) => {
                  const cell = dayCellState({
                    date: day,
                    min,
                    max,
                    today,
                    selected: value,
                    isClosed,
                    hasFree,
                  });
                  return (
                    <span key={cell.key} role="gridcell" className="day-picker-cell-wrap">
                      <button
                        type="button"
                        className={[
                          "day-picker-cell",
                          cell.outside ? "is-outside" : "",
                          cell.closed ? "is-closed" : "",
                          cell.today ? "is-today" : "",
                          cell.selected ? "is-active" : "",
                          cell.free ? "has-free" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={cell.selected}
                        aria-label={`${fullDate(day)}${cell.closed ? ` · ${t("picker.closed")}` : ""}`}
                        aria-current={cell.today ? "date" : undefined}
                        disabled={!cell.enabled}
                        onClick={() => onChange(day)}
                      >
                        {day.getDate()}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="day-picker-legend" aria-hidden="true">
            {hasFree ? (
              <span>
                <i className="dot free" /> {dotLabel ?? t("picker.legend_free")}
              </span>
            ) : null}
            <span>
              <s>12</s> {t("picker.closed")}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
