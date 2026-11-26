"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LocaleCode, LocalizedString, MapCoordinates } from "@/lib/api";
import {
  bookingRange,
  closesNextDay,
  DAY_COUNT,
  DEFAULT_DAY,
  defaultWeek,
  describeHours,
  formatClock,
  formatHoursText,
  groupDays,
  hoursVaryByDay,
  isRoundTheClock,
  parseClock,
  parseHoursText,
  type DayHours,
  type HoursLabels,
  type WeekHours,
} from "@/lib/opening-hours";
import { getSiteCopy } from "@/lib/site-copy";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { guestFallbackLocale, TEXT_LOCALES, type ProfileChange, type ProfileValues } from "@/lib/venue-profile";

/* Field editors of the cabinet venue profile: localized texts, cuisine chips, weekly hours, change lists. */
export const SUPPORT_EMAIL = "partners@seatiko.md";

/** Cuisine codes owners pick from (labels from the catalog copy, same codes as guest filters). */
const CUISINE_PRIMARY = [
  "moldovan", "european", "italian", "mediterranean", "asian", "japanese", "chinese", "american", "mexican",
  "grill", "steak", "burgers", "pizza", "seafood", "bakery", "dessert", "vegetarian", "fast_food",
];
const CUISINE_MORE = ["traditional", "wine", "cafe", "cafe_sweets", "pub", "lounge", "fine_dining", "family", "pizzeria", "wine_bar"];
const CUSTOM_CUISINE_MAX = 30;

export type SiteCopy = ReturnType<typeof getSiteCopy>;
export type ProfileCopy = SiteCopy["cabinet"]["profileTab"];

export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

/** A sentence with "{email}" → the same sentence with a mail link to support. */
export function withSupportLink(template: string): ReactNode {
  const [before, after = ""] = template.split("{email}");
  return (
    <>
      {before}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      {after}
    </>
  );
}

export function hoursLabels(t: ProfileCopy): HoursLabels {
  return { days: [...t.dayShort], closed: t.closedWord, roundTheClock: t.roundTheClock, everyDay: t.everyDay };
}

/** Great-circle distance in metres. */
function distanceMetres(a: MapCoordinates, b: MapCoordinates) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/* —— Icons —— */

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
export const LockIcon = () => <Icon><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Icon>;
export const EditIcon = () => <Icon size={15}><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></Icon>;
export const ClockIcon = () => <Icon><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>;
export const AlertIcon = () => <Icon><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></Icon>;
export const CheckIcon = () => <Icon><polyline points="20 6 9 17 4 12" /></Icon>;
export const ExternalIcon = () => <Icon size={14}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Icon>;
const CopyIcon = () => <Icon size={15}><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Icon>;
export const PlusIcon = () => <Icon size={20}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>;
export const ImageIcon = () => <Icon size={22}><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></Icon>;

/* —— Small field pieces —— */

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <small id={id} className="owner-field-error vp-field-error" role="alert">
      {children}
    </small>
  );
}

function LanguagePills({
  value,
  active,
  onPick,
  t,
}: {
  value: LocalizedString;
  active: LocaleCode;
  onPick: (locale: LocaleCode) => void;
  t: ProfileCopy;
}) {
  return (
    <div className="vp-langs" role="group" aria-label={t.textLanguage}>
      {TEXT_LOCALES.map((code) => {
        const filled = value[code].trim() !== "";
        const label = code.toUpperCase();
        const state = fill(filled ? t.langFilled : t.langEmpty, { lang: label });
        return (
          <button
            key={code}
            type="button"
            className={code === active ? "active" : ""}
            aria-pressed={code === active}
            aria-label={state}
            title={state}
            onClick={() => onPick(code)}
          >
            {label}
            <i className={filled ? "filled" : ""} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export function LocalizedField({
  id,
  label,
  value,
  locale,
  onLocaleChange,
  onChange,
  readOnly,
  required,
  multiline,
  maxLength,
  placeholder,
  error,
  t,
}: {
  id: string;
  label: string;
  value: LocalizedString;
  locale: LocaleCode;
  onLocaleChange: (locale: LocaleCode) => void;
  onChange: (value: LocalizedString) => void;
  readOnly: boolean;
  required?: boolean;
  multiline?: boolean;
  maxLength: number;
  placeholder?: string;
  error?: string | null;
  t: ProfileCopy;
}) {
  const current = value[locale];
  const fallback = guestFallbackLocale(value, locale);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : "", fallback && fallback !== locale ? hintId : ""].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    lang: locale,
    value: current,
    readOnly,
    maxLength: multiline ? undefined : maxLength,
    placeholder: readOnly ? t.notSet : placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    onChange: (event: { target: { value: string } }) => onChange({ ...value, [locale]: event.target.value }),
  } as const;
  return (
    <div className="field owner-field-wide vp-field">
      <div className="vp-label-row">
        <label htmlFor={id}>
          {label}
          {required && !readOnly && <span className="vp-req" aria-hidden="true"> *</span>}
        </label>
        <LanguagePills value={value} active={locale} onPick={onLocaleChange} t={t} />
      </div>
      {multiline ? (
        <div className="vp-textarea">
          <textarea {...common} rows={3} />
          {!readOnly && (
            <small className={`vp-counter${current.length > maxLength ? " over" : ""}`} aria-live="polite">
              {current.length}/{maxLength}
            </small>
          )}
        </div>
      ) : (
        <input {...common} enterKeyHint="next" />
      )}
      {fallback && fallback !== locale && (
        <p id={hintId} className="owner-field-hint vp-fallback">
          {fill(t.langFallback, { lang: locale.toUpperCase(), fallback: fallback.toUpperCase() })}
        </p>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export function CuisinePicker({
  value,
  onChange,
  readOnly,
  error,
  copy,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  readOnly: boolean;
  error?: string | null;
  copy: SiteCopy;
}) {
  const t = copy.cabinet.profileTab;
  const names = copy.catalog.cuisines as Record<string, string>;
  const [expanded, setExpanded] = useState(() => value.some((code) => CUISINE_MORE.includes(code)));
  const [custom, setCustom] = useState("");
  const known = [...CUISINE_PRIMARY, ...CUISINE_MORE];
  const customSelected = value.filter((code) => !known.includes(code));
  const label = (code: string) => names[code] ?? code;
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((item) => item !== code) : [...value, code]);
  const addCustom = () => {
    const name = custom.trim().replace(/\s+/g, " ").slice(0, CUSTOM_CUISINE_MAX);
    if (!name) return;
    const match = Object.entries(names).find(([, text]) => text.toLowerCase() === name.toLowerCase());
    const code = match ? match[0] : name;
    if (!value.includes(code)) onChange([...value, code]);
    if (match && CUISINE_MORE.includes(code)) setExpanded(true);
    setCustom("");
  };

  if (readOnly) {
    return (
      <div className="field owner-field-wide vp-field">
        <span className="vp-label" id="venue-cuisine-label">{t.cuisineLabel}</span>
        <div id="venue-cuisine" className="vp-chips readonly" aria-labelledby="venue-cuisine-label">
          {value.length ? (
            value.map((code, index) => (
              <span key={code} className="vp-chip active">
                {index === 0 && <b>{t.cuisineMain}</b>}
                {label(code)}
              </span>
            ))
          ) : (
            <span className="vp-empty-value">{t.notSet}</span>
          )}
        </div>
      </div>
    );
  }

  const chip = (code: string) => {
    const position = value.indexOf(code);
    const selected = position >= 0;
    return (
      <button
        key={code}
        type="button"
        className={`vp-chip${selected ? " active" : ""}`}
        aria-pressed={selected}
        onClick={() => toggle(code)}
      >
        {selected && <b aria-hidden="true">{position + 1}</b>}
        {label(code)}
      </button>
    );
  };

  return (
    <div className="field owner-field-wide vp-field">
      <span className="vp-label" id="venue-cuisine-label">
        {t.cuisineLabel}
        <span className="vp-req" aria-hidden="true"> *</span>
      </span>
      <div
        id="venue-cuisine"
        className="vp-chips"
        role="group"
        tabIndex={-1}
        aria-labelledby="venue-cuisine-label"
        aria-describedby={error ? "venue-cuisine-error" : "venue-cuisine-hint"}
      >
        {CUISINE_PRIMARY.map(chip)}
        {expanded && CUISINE_MORE.map(chip)}
        {customSelected.map((code) => (
          <span key={code} className="vp-chip active custom">
            <b aria-hidden="true">{value.indexOf(code) + 1}</b>
            {code}
            <button type="button" aria-label={fill(t.cuisineRemove, { name: code })} onClick={() => toggle(code)}>
              ×
            </button>
          </span>
        ))}
        <button type="button" className="vp-chip more" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          {expanded ? t.cuisineLess : t.cuisineMore}
        </button>
      </div>
      <div className="vp-custom-row">
        <input
          id="venue-cuisine-custom"
          value={custom}
          maxLength={CUSTOM_CUISINE_MAX}
          placeholder={t.cuisineCustomPlaceholder}
          aria-label={t.cuisineCustomPlaceholder}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustom();
            }
          }}
        />
        <button type="button" className="panel-btn ghost vp-nowrap" disabled={!custom.trim()} onClick={addCustom}>
          {t.cuisineAdd}
        </button>
      </div>
      {error ? (
        <FieldError id="venue-cuisine-error">{error}</FieldError>
      ) : (
        <p id="venue-cuisine-hint" className="owner-field-hint">
          {customSelected.length ? `${t.cuisineHint} ${t.cuisineCustomHint}` : t.cuisineHint}
        </p>
      )}
    </div>
  );
}

/* —— Opening hours —— */

function TimeInput({ value, label, onChange }: { value: number; label: string; onChange: (minutes: number) => void }) {
  return (
    <input
      type="time"
      step={900}
      className="vp-time"
      aria-label={label}
      value={formatClock(value)}
      onChange={(event) => {
        const minutes = parseClock(event.target.value);
        if (minutes !== null) onChange(minutes);
      }}
    />
  );
}

export function HoursEditor({
  value,
  onChange,
  readOnly,
  error,
  t,
}: {
  value: string;
  onChange: (text: string) => void;
  readOnly: boolean;
  error?: string | null;
  t: ProfileCopy;
}) {
  const parsed = useMemo(() => parseHoursText(value), [value]);
  // An all-closed week has no text ("" = not set), so the grid keeps its own copy while it is edited.
  const [week, setWeek] = useState<WeekHours | null>(parsed);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    const mine = week ? formatHoursText(week) : null;
    if (mine !== value) setWeek(parsed);
  }
  const labels = hoursLabels(t);
  const update = (next: WeekHours) => {
    setWeek(next);
    const text = formatHoursText(next);
    setSeen(text);
    onChange(text);
  };
  const setDay = (index: number, day: DayHours) => update(week!.map((item, i) => (i === index ? day : item)));

  if (readOnly) {
    return (
      <div id="venue-hours" className="vp-hours readonly" tabIndex={-1}>
        {parsed ? (
          groupDays(parsed).map(({ from, to, hours: day }) => (
            <div key={from} className={`vp-hours-row${day.closed ? " closed" : ""}`}>
              <span className="vp-day" title={from === to ? t.dayLong[from] : `${t.dayLong[from]} – ${t.dayLong[to]}`}>
                {from === to ? t.dayShort[from] : `${t.dayShort[from]}–${t.dayShort[to]}`}
              </span>
              <span className="vp-hours-value">
                {day.closed ? t.dayClosed : isRoundTheClock(day) ? t.roundTheClock : `${formatClock(day.open)} – ${formatClock(day.close)}`}
                {!day.closed && closesNextDay(day) && <em title={fill(t.nextDayTitle, { time: formatClock(day.close) })}>{t.nextDay}</em>}
              </span>
            </div>
          ))
        ) : (
          <p className={value ? "vp-hours-raw" : "vp-empty-value"}>{value || t.hoursEmpty}</p>
        )}
      </div>
    );
  }

  if (!week) {
    const range = bookingRange(value);
    const start = () => {
      if (range) {
        const [open, close] = range.split("–").map((part) => parseClock(part)!);
        update(Array.from({ length: DAY_COUNT }, () => ({ closed: false, open, close })));
      } else update(defaultWeek());
    };
    return (
      <div id="venue-hours" className={`vp-hours-empty${error ? " invalid" : ""}`} tabIndex={-1}>
        <p>{value ? fill(t.hoursUnparsed, { text: value }) : t.hoursEmpty}</p>
        <button type="button" className="panel-btn ghost vp-nowrap" onClick={start}>
          {value ? t.hoursRebuild : t.hoursSet}
        </button>
        {error && <FieldError id="venue-hours-error">{error}</FieldError>}
      </div>
    );
  }

  const allClosed = week.every((day) => day.closed);
  const range = bookingRange(formatHoursText(week));
  return (
    <div id="venue-hours" className="vp-hours" tabIndex={-1} aria-describedby={error ? "venue-hours-error" : undefined}>
      {week.map((day, index) => {
        const open = !day.closed;
        const dayName = t.dayLong[index];
        return (
          <div key={index} className={`vp-hours-row${open ? "" : " closed"}`}>
            <span className="vp-day" title={dayName}>{t.dayShort[index]}</span>
            <button
              type="button"
              role="switch"
              aria-checked={open}
              aria-label={`${dayName}: ${t.dayOpen}`}
              className="vp-switch"
              onClick={() => setDay(index, open ? { closed: true } : { ...(week.find((item) => !item.closed) ?? DEFAULT_DAY) })}
            >
              <i aria-hidden="true" />
              <span>{open ? t.dayOpen : t.dayClosed}</span>
            </button>
            {open ? (
              <span className="vp-hours-times">
                <TimeInput value={day.open} label={`${dayName}: ${t.opensAt}`} onChange={(minutes) => setDay(index, { ...day, open: minutes })} />
                <span aria-hidden="true">–</span>
                <TimeInput value={day.close} label={`${dayName}: ${t.closesAt}`} onChange={(minutes) => setDay(index, { ...day, close: minutes })} />
                {isRoundTheClock(day) ? (
                  <em>{t.roundTheClock}</em>
                ) : closesNextDay(day) ? (
                  <em title={fill(t.nextDayTitle, { time: formatClock(day.close) })}>{t.nextDay}</em>
                ) : null}
              </span>
            ) : (
              <span className="vp-hours-times muted" />
            )}
            <button
              type="button"
              className="vp-icon-btn"
              disabled={!open}
              title={fill(t.copyToAll, { day: dayName })}
              aria-label={fill(t.copyToAll, { day: dayName })}
              onClick={() => update(week.map(() => ({ ...day })))}
            >
              <CopyIcon />
            </button>
          </div>
        );
      })}
      {allClosed && <FieldError id="venue-hours-error">{t.hoursAllClosed}</FieldError>}
      {!allClosed && error && <FieldError id="venue-hours-error">{error}</FieldError>}
      {!allClosed && hoursVaryByDay(week) && range && (
        <p className="vp-note">
          <AlertIcon />
          <span>{fill(t.hoursBookingNote, { range })}</span>
        </p>
      )}
      {!allClosed && <p className="vp-hours-summary">{describeHours(week, labels)}</p>}
    </div>
  );
}

/* —— Change list (review dialog, pending requests) —— */

export function ChangeList({
  changes,
  before,
  after,
  valueText,
  t,
}: {
  changes: ProfileChange[];
  before: ProfileValues;
  after: ProfileValues;
  valueText: (change: ProfileChange, values: ProfileValues) => string;
  t: ProfileCopy;
}) {
  const names = t.fieldNames as Record<string, string>;
  return (
    <ul className="vp-changes">
      {changes.map((change) => {
        let afterText = valueText(change, after);
        if (change.field === "point" && before.lat && after.lat) {
          const metres = distanceMetres(before, after);
          const distance = metres >= 1000 ? fill(t.kilometres, { n: (metres / 1000).toFixed(1) }) : fill(t.metres, { n: Math.round(metres) });
          afterText = `${afterText} · ${fill(t.pointMoved, { distance })}`;
        }
        return (
          <li key={`${change.field}-${change.locale ?? ""}`}>
            <strong>
              {names[change.field] ?? change.field}
              {change.locale && <span className="vp-lang-tag">{change.locale.toUpperCase()}</span>}
            </strong>
            <span className="vp-change-before">
              <small>{t.before}</small>
              <span>{valueText(change, before)}</span>
            </span>
            <span className="vp-change-after">
              <small>{t.after}</small>
              <span>{afterText}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ReviewDialog({
  open,
  busy,
  count,
  children,
  onSend,
  onClose,
  t,
}: {
  open: boolean;
  busy: boolean;
  count: string;
  children: ReactNode;
  onSend: () => void;
  onClose: () => void;
  t: ProfileCopy;
}) {
  const ref = useRef<HTMLElement>(null);
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
  return createPortal(
    <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
      <button type="button" className="booking-popup-backdrop" aria-label={t.reviewBack} onClick={onClose} />
      <section ref={ref} className="booking-popup cabinet-delete-dialog vp-review-dialog" role="dialog" aria-modal="true" aria-labelledby="vp-review-title">
        <div className="booking-popup-card cabinet-delete-card warning vp-review-card">
          <button type="button" className="booking-popup-x" onClick={onClose} aria-label={t.reviewBack}>
            ×
          </button>
          <h3 id="vp-review-title">{t.reviewDialogTitle}</h3>
          <p className="cabinet-delete-text">
            {t.reviewDialogIntro} <b>{count}</b>
          </p>
          <div className="vp-review-body">{children}</div>
          <div className="cabinet-delete-actions">
            <button type="button" className="panel-btn" disabled={busy} onClick={onSend}>
              {t.reviewSend}
            </button>
            <button type="button" className="panel-btn ghost" data-autofocus disabled={busy} onClick={onClose}>
              {t.reviewBack}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

