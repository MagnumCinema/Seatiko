"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getSiteCopy } from "@/lib/site-copy";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import {
  addDays,
  clockMinutes,
  formatTime,
  isOvernight,
  normalizeTime,
  shiftSpan,
  type ShiftIssue,
  type ShiftLike,
} from "@/lib/shift-schedule";

export type Locale = "ru" | "en" | "ro";
export type CabinetCopy = ReturnType<typeof getSiteCopy>["cabinet"];
export type PlanCopy = CabinetCopy["shiftPlan"];

export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const LANG: Record<Locale, string> = { ru: "ru-RU", en: "en-GB", ro: "ro-RO" };
export const langOf = (locale: Locale) => LANG[locale];

/** Plural form for a count: RU one/few/many, EN one/other, RO one/few/other. */
export function plural(n: number, forms: readonly string[], locale: Locale): string {
  const cat = new Intl.PluralRules(LANG[locale]).select(n);
  if (forms.length === 2) return cat === "one" ? forms[0] : forms[1];
  if (cat === "one") return forms[0];
  if (cat === "few") return forms[1];
  return forms[2] ?? forms[1];
}

/** "12 ч", "7 ч 30 мин". */
export function formatDuration(minutes: number, copy: PlanCopy): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!rest) return `${h} ${copy.hoursUnit}`;
  if (!h) return `${rest} ${copy.minutesUnit}`;
  return `${h} ${copy.hoursUnit} ${rest} ${copy.minutesUnit}`;
}

/** Totals: "28 ч", "28,5 ч". */
export function formatHours(minutes: number, copy: PlanCopy, locale: Locale): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h.toLocaleString(LANG[locale])} ${copy.hoursUnit}`;
}

/** A calendar date as text, read in UTC so the browser's time zone never shifts it. */
export function formatDate(date: string, locale: Locale, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(LANG[locale], { ...opts, timeZone: "UTC" });
}

/** "Сегодня", "Завтра", else "чт, 10 дек.". */
export function dayLabel(date: string, today: string, locale: Locale, copy: CabinetCopy): string {
  if (date === today) return copy.shiftPlan.today;
  if (date === addDays(today, 1)) return copy.opsScheduleFilterTomorrow;
  return formatDate(date, locale, { weekday: "short", day: "numeric", month: "short" });
}

/** Short weekday names Monday…Sunday in the locale. */
export function weekdayNames(locale: Locale): string[] {
  return Array.from({ length: 7 }, (_, i) => formatDate(addDays("2026-11-30", i), locale, { weekday: "short" }));
}

/** "20:00–02:00" with a "+1" mark when the shift ends the next day. */
export function ShiftHours({ start, end, className = "" }: { start: string; end: string; className?: string }) {
  const overnight = isOvernight(start, end);
  return (
    <span className={`shift-hours ${className}`}>
      {normalizeTime(start)}–{normalizeTime(end)}
      {overnight && <sup className="shift-next-day">+1</sup>}
    </span>
  );
}

export const shiftHoursText = (s: Pick<ShiftLike, "start_time" | "end_time">) =>
  `${normalizeTime(s.start_time)}–${normalizeTime(s.end_time)}${isOvernight(s.start_time, s.end_time) ? " (+1)" : ""}`;

/** "чт, 10 дек. 20:00–02:00 (+1)". */
export function shiftWhen(s: ShiftLike, today: string, locale: Locale, copy: CabinetCopy): string {
  return `${dayLabel(s.date, today, locale, copy)} ${shiftHoursText(s)}`;
}

/** Text of an issue for people. */
export function issueText(issue: ShiftIssue, today: string, locale: Locale, copy: CabinetCopy): string {
  const p = copy.shiftPlan;
  switch (issue.code) {
    case "invalid_time":
      return p.issueInvalid;
    case "zero_length":
      return p.issueZero;
    case "ended":
      return p.issueEnded;
    case "started":
      return p.issueStarted;
    case "overlap":
      return fill(p.issueOverlap, { when: shiftWhen(issue.shift, today, locale, copy) });
    case "duplicate":
      return fill(p.issueDuplicate, { when: shiftWhen(issue.shift, today, locale, copy) });
    case "short_rest":
      return fill(p.issueRest, { rest: formatDuration(issue.restMinutes, p), when: shiftWhen(issue.shift, today, locale, copy) });
    case "long_shift":
      return fill(p.issueLong, { hours: formatDuration(issue.minutes, p) });
    case "outside_hours":
      return fill(p.issueHours, { open: formatTime(issue.open), close: formatTime(issue.close) });
    case "too_many_days":
      return fill(p.issueDays, { days: issue.days });
  }
}

/** Length line under time fields: "Длительность: 8 ч · Заканчивается на следующий день в 02:00". */
export function LengthNote({ date, start, end, copy }: { date: string; start: string; end: string; copy: PlanCopy }) {
  const span = shiftSpan({ date, start_time: start, end_time: end });
  if (!span || start === end) return null;
  const dst = span.minutes !== clockMinutes(start, end);
  return (
    <p className="shift-length-note">
      {fill(copy.length, { hours: formatDuration(span.minutes, copy) })}
      {dst && <> ({copy.dstNote})</>}
      {span.overnight && <> · {fill(copy.endsNextDay, { time: normalizeTime(end) })}</>}
    </p>
  );
}

/** Blocking problems (red) and warnings (amber) of a shift or a person in a list. */
export function IssueList({
  blocking,
  warnings,
  extra = [],
  today,
  locale,
  copy,
  action,
  blockedTitle,
}: {
  blocking: ShiftIssue[];
  warnings: ShiftIssue[];
  /** Ready-made warning lines (weekly hours, invite not accepted…). */
  extra?: string[];
  today: string;
  locale: Locale;
  copy: CabinetCopy;
  action?: ReactNode;
  /** Title of the red block (default: "can't save"). */
  blockedTitle?: string;
}) {
  const unique = (list: ShiftIssue[]) => [...new Set(list.map((i) => issueText(i, today, locale, copy)))];
  const bad = unique(blocking);
  const warn = [...unique(warnings), ...extra];
  if (!bad.length && !warn.length) return null;
  return (
    <div className="shift-issues">
      {bad.length > 0 && (
        <div className="shift-issues-block bad" role="alert">
          <strong>{blockedTitle ?? copy.shiftPlan.blockedTitle}</strong>
          <ul>
            {bad.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {action}
        </div>
      )}
      {warn.length > 0 && (
        <div className="shift-issues-block warn" role="status">
          <strong>{copy.shiftPlan.warningsTitle}</strong>
          <ul>
            {warn.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Modal frame used by all planner dialogs: focus trap, Escape, scroll lock, phone layout. */
export function ShiftDialog({
  open,
  onClose,
  title,
  sub,
  size = "normal",
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  size?: "normal" | "wide" | "small";
  closeLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialogFocus(open, ref, onClose);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  const sizeClass = size === "wide" ? "wide" : size === "small" ? "cabinet-delete-dialog" : "";
  return createPortal(
    <div className="booking-popup-root cabinet-shift-modal-root" role="presentation">
      <button type="button" className="booking-popup-backdrop" aria-label={closeLabel} onClick={onClose} />
      <section ref={ref} className={`booking-popup cabinet-shift-dialog shift-dialog ${sizeClass}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="booking-popup-card cabinet-shift-card">
          <button type="button" className="booking-popup-x" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
          <h3 id={titleId}>{title}</h3>
          {sub && <p className="cabinet-shift-dialog-sub">{sub}</p>}
          {children}
        </div>
      </section>
    </div>,
    document.body,
  );
}

/** Status label of a shift. */
export function statusLabel(status: ShiftLike["status"], copy: CabinetCopy): string {
  if (status === "CONFIRMED") return copy.opsScheduleConfirmed;
  if (status === "SWAP_REQUESTED") return copy.staffSwapStatusBadge;
  if (status === "DECLINED") return copy.opsScheduleDeclined;
  return copy.opsSchedulePending;
}

export const statusIcon = (status: ShiftLike["status"]) =>
  status === "CONFIRMED" ? "✓" : status === "PENDING" ? "⏳" : status === "SWAP_REQUESTED" ? "⚠" : "✕";
