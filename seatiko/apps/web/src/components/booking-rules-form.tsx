"use client";

import "@/app/cabinet/rules.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, type Locale } from "@/components/locale-provider";
import { BookingRulesNote } from "@/components/booking-rules-note";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import { VenueBookingRules } from "@/components/venue-booking-rules";
import { fetchVenue, updateBookingRules, type Venue } from "@/lib/api";
import { BOOKING_DAYS_AHEAD, MIN_LEAD_MIN } from "@/lib/booking-slots";
import {
  dailyStartTimes,
  exampleBookingMinute,
  formatRuleMinutes,
  guestTimeline,
  intervalChoices,
  parseRuleInput,
  previewRules,
  ruleWarnings,
  saveErrorKind,
  stepRuleValue,
  type TimelineKind,
} from "@/lib/cabinet-rules";
import { getSiteCopy } from "@/lib/site-copy";
import { useLeaveGuard } from "@/lib/use-leave-guard";
import { describeHours, hoursLabelsFor, hoursVaryByDay, parseHoursText, VENUE_HOURS, venueOpeningHours } from "@/lib/venue-hours";
import {
  BOOKING_RULE_KEYS,
  BOOKING_RULE_LIMITS,
  DEFAULT_BOOKING_RULES,
  durationOptions,
  resolveBookingRules,
  validateBookingRules,
  type BookingRuleError,
  type BookingRuleKey,
  type BookingRules,
} from "@/lib/venue-rules";

type FormValues = Record<BookingRuleKey, string>;
type GroupId = "time" | "late" | "seating" | "preorder";
type PluralForms = { one: string; few: string; many: string; other: string };
type Notice = { kind: "saved"; at: Date } | { kind: "error"; text: string } | { kind: "defaults" };

const GROUPS: { id: GroupId; keys: BookingRuleKey[] }[] = [
  { id: "time", keys: ["booking_interval_min", "visit_duration_min", "max_visit_duration_min"] },
  { id: "late", keys: ["hold_minutes", "max_late_arrival_min"] },
  { id: "seating", keys: ["session_start_before_min", "release_before_min"] },
  { id: "preorder", keys: ["preorder_lead_min"] },
];

/** Shown first in the preview when there is something to show (times / lengths stay short). */
const PREVIEW_TIMES_HEAD = 4;
const PREVIEW_TIMES_TAIL = 2;

function toFormValues(rules: BookingRules): FormValues {
  return Object.fromEntries(BOOKING_RULE_KEYS.map((key) => [key, String(rules[key])])) as FormValues;
}

function parseForm(values: FormValues): BookingRules {
  return Object.fromEntries(BOOKING_RULE_KEYS.map((key) => [key, parseRuleInput(values[key])])) as BookingRules;
}

function plural(locale: Locale, n: number, forms: PluralForms): string {
  const form = new Intl.PluralRules(locale).select(n);
  const text = form === "one" || form === "few" || form === "many" ? forms[form] : forms.other;
  return text.replace("{n}", String(n));
}

function GroupIcon({ id }: { id: GroupId }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (id) {
    case "time":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
      );
    case "late":
      return (
        <svg {...common}>
          <path d="M6 2h12M6 22h12" />
          <path d="M7 2v4.5a5 5 0 0 0 2 4L12 12l3-1.5a5 5 0 0 0 2-4V2" />
          <path d="M7 22v-4.5a5 5 0 0 1 2-4L12 12l3 1.5a5 5 0 0 1 2 4V22" />
        </svg>
      );
    case "seating":
      return (
        <svg {...common}>
          <path d="M6 20v-6h12v6" />
          <path d="M8 14V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v9" />
          <path d="M4 14h16" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 13h18" />
          <path d="M5 13a7 7 0 0 1 14 0" />
          <path d="M12 6V4" />
          <path d="M4 17h16" />
        </svg>
      );
  }
}

type Props = {
  venueId: string;
  /** False for an application that is not published yet: the API cannot store its rules. */
  published?: boolean;
  /** The application's hours: what an unpublished draft will open with. */
  hoursText?: string;
};

/** Owner cabinet → «Правила бронирования»: the venue's booking rules with a live guest preview. */
export function BookingRulesForm({ venueId, published = true, hoursText = "" }: Props) {
  const { locale, t } = useLocale();
  const copy = getSiteCopy(locale).cabinet.rulesTab;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Partial<Record<BookingRuleKey, HTMLElement | null>>>({});

  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState<BookingRules>(DEFAULT_BOOKING_RULES);
  const [savedPreorder, setSavedPreorder] = useState(true);
  const [values, setValues] = useState<FormValues>(() => toFormValues(DEFAULT_BOOKING_RULES));
  const [preorder, setPreorder] = useState(true);
  const [venueHours, setVenueHours] = useState("");
  const [touched, setTouched] = useState<Partial<Record<BookingRuleKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [leaveResume, setLeaveResume] = useState<(() => void) | null>(null);

  const readOnly = !published;

  /** Shows what the API has for the venue (after loading or saving) as the saved state. */
  const apply = useCallback((venue: Partial<Venue> | null) => {
    const rules = resolveBookingRules(venue);
    const allow = venue?.allow_preorder !== false;
    setSaved(rules);
    setValues(toFormValues(rules));
    setSavedPreorder(allow);
    setPreorder(allow);
    setVenueHours(venue?.hours_text ?? "");
    setTouched({});
    setSubmitted(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchVenue(venueId)
      .then((venue) => {
        if (cancelled) return;
        apply(venue);
        setPhase("ready");
      })
      .catch(() => {
        if (cancelled) return;
        // A draft shows the defaults read-only anyway; a live venue must not be edited from defaults.
        if (!published) {
          apply(null);
          setPhase("ready");
        } else {
          setPhase("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [venueId, published, reloadKey, apply]);

  const parsed = useMemo(() => parseForm(values), [values]);
  const preview = useMemo(() => previewRules(parsed, saved), [parsed, saved]);
  // Compared as numbers: "090" is still 90; an empty field (NaN) counts as a change.
  const changedKeys = BOOKING_RULE_KEYS.filter((key) => parsed[key] !== saved[key]);
  const preorderChanged = preorder !== savedPreorder;
  const changeCount = changedKeys.length + (preorderChanged ? 1 : 0);
  const dirty = changeCount > 0;
  const atDefaults = BOOKING_RULE_KEYS.every((key) => parsed[key] === DEFAULT_BOOKING_RULES[key]);

  const units = { h: copy.unitH, min: copy.unitMin };
  const minutes = (min: number) => formatRuleMinutes(min, units);
  const clock = (min: number) =>
    new Date(2000, 0, 1, 0, min).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  /** Same wording as the duration chips guests see in the booking window. */
  const guestDuration = (min: number) =>
    min % 30 === 0 && min >= 60
      ? t("res.duration_hours", { h: (min / 60).toLocaleString(locale, { maximumFractionDigits: 1 }) })
      : t("res.duration_minutes", { min });

  // Guests book by the published venue's hours; a pending profile change in the application
  // does not apply yet, so the application's hours are only used for an unpublished draft.
  const hoursSource = venueHours.trim() || (readOnly ? hoursText.trim() : "");
  const hours = venueOpeningHours({ id: venueId, hours_text: hoursSource });
  const dayLength = hours.closeMin - hours.openMin;
  const hoursKnown = Boolean(hoursSource) || Boolean(VENUE_HOURS[venueId]);
  // A week that differs by day (days off, a later Friday) reads day by day; examples use its first open day.
  const week = parseHoursText(hoursSource);
  const hoursLabel = !hoursKnown
    ? copy.hoursFallback
    : week && hoursVaryByDay(week)
      ? describeHours(week, hoursLabelsFor(locale))
      : dayLength >= 24 * 60
        ? copy.hours24
        : `${clock(hours.openMin)}–${clock(hours.closeMin)}`;

  const errors = useMemo(() => validateBookingRules(parsed), [parsed]);
  const warnings = ruleWarnings(preview, hours);
  const starts = dailyStartTimes(preview, hours);
  const exampleAt = exampleBookingMinute(starts, hours);
  const timeline = guestTimeline(preview, exampleAt, { preorder });
  const durations = durationOptions(preview);

  function errorText(error: BookingRuleError): string {
    const { key } = error;
    if (error.reason === "range") {
      if (!Number.isFinite(parsed[key])) return copy.errors.empty;
      const { min, max } = BOOKING_RULE_LIMITS[key];
      return copy.errors.range.replace("{min}", minutes(min)).replace("{max}", minutes(max));
    }
    if (error.reason === "below_hold") return copy.errors.belowHold.replace("{hold}", minutes(parsed.hold_minutes));
    return copy.errors.aboveMax.replace("{max}", minutes(parsed.max_visit_duration_min));
  }

  /** Range errors wait until the owner leaves the field (or tries to save); pair errors show at once. */
  function visibleError(key: BookingRuleKey): string | null {
    const error = errors.find((e) => e.key === key);
    if (!error) return null;
    if (error.reason === "range" && !touched[key] && !submitted) return null;
    return errorText(error);
  }

  function warningText(key: BookingRuleKey): string | null {
    const warning = warnings.find((w) => w.key === key);
    return warning ? copy.warnings[warning.reason].replace("{day}", minutes(dayLength)) : null;
  }

  function setValue(key: BookingRuleKey, raw: string) {
    setValues((prev) => ({ ...prev, [key]: raw.replace(/\D/g, "").slice(0, 4) }));
    if (notice?.kind !== "defaults") setNotice(null);
  }

  function step(key: BookingRuleKey, direction: 1 | -1) {
    setValue(key, String(stepRuleValue(key, parsed[key], direction)));
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function discard() {
    setValues(toFormValues(saved));
    setPreorder(savedPreorder);
    setTouched({});
    setSubmitted(false);
    setNotice(null);
  }

  function fillDefaults() {
    setValues(toFormValues(DEFAULT_BOOKING_RULES));
    setTouched({});
    setNotice({ kind: "defaults" });
  }

  async function save() {
    if (readOnly || saving || !dirty) return;
    setSubmitted(true);
    if (errors.length > 0) {
      const first = BOOKING_RULE_KEYS.find((key) => errors.some((e) => e.key === key));
      if (first) inputRefs.current[first]?.focus();
      return;
    }
    const patch: Parameters<typeof updateBookingRules>[1] = {};
    for (const key of changedKeys) patch[key] = parsed[key];
    if (preorderChanged) patch.allow_preorder = preorder;
    setSaving(true);
    setNotice(null);
    try {
      apply(await updateBookingRules(venueId, patch));
      setNotice({ kind: "saved", at: new Date() });
    } catch (error) {
      setNotice({ kind: "error", text: copy.saveErrors[saveErrorKind(error)] });
    } finally {
      setSaving(false);
    }
  }

  useLeaveGuard(phase === "ready" && dirty && !readOnly, rootRef, (resume) => setLeaveResume(() => resume));

  function equivalent(key: BookingRuleKey): string | null {
    const value = parsed[key];
    if (!Number.isFinite(value)) return null;
    if (value === 0 && key in copy.zero) return copy.zero[key as keyof typeof copy.zero];
    return value >= 60 ? `= ${minutes(value)}` : null;
  }

  function field(key: BookingRuleKey): ReactNode {
    const id = `rules-${key}`;
    const [label, hint] = copy.fields[key];
    const error = visibleError(key);
    const warning = error ? null : warningText(key);
    const { min, max } = BOOKING_RULE_LIMITS[key];
    const value = parsed[key];
    const disabled = readOnly || saving || (key === "preorder_lead_min" && !preorder);
    const changed = changedKeys.includes(key);
    const describedBy = [`${id}-hint`, error ? `${id}-error` : warning ? `${id}-warning` : ""].filter(Boolean).join(" ");
    const labelContent = (
      <>
        {label}
        {changed ? (
          <span className="rt-changed" title={copy.changed}>
            <span className="rt-sr">{copy.changed}</span>
          </span>
        ) : null}
      </>
    );

    if (key === "booking_interval_min") {
      return (
        <div key={key} className={`rt-field rt-field-stacked${error ? " invalid" : ""}`}>
          <div className="rt-field-text">
            <span id={`${id}-label`} className="rt-label">
              {labelContent}
            </span>
            <p id={`${id}-hint`} className="rt-hint">
              {hint}
            </p>
          </div>
          <div className="rt-chips" role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
            {intervalChoices(value).map((choice, index) => (
              <button
                key={choice}
                ref={index === 0 ? (el) => void (inputRefs.current[key] = el) : undefined}
                type="button"
                className={choice === value ? "on" : ""}
                aria-pressed={choice === value}
                disabled={disabled}
                onClick={() => {
                  setValue(key, String(choice));
                  setTouched((prev) => ({ ...prev, [key]: true }));
                }}
              >
                {minutes(choice)}
              </button>
            ))}
          </div>
          {error ? (
            <p id={`${id}-error`} className="rt-error" role="alert">
              {error}
            </p>
          ) : warning ? (
            <p id={`${id}-warning`} className="rt-warning">
              {warning}
            </p>
          ) : null}
        </div>
      );
    }

    const equiv = equivalent(key);
    return (
      <div key={key} className={`rt-field${error ? " invalid" : ""}${disabled && !readOnly ? " muted" : ""}`}>
        <div className="rt-field-text">
          <label htmlFor={id} className="rt-label">
            {labelContent}
          </label>
          <p id={`${id}-hint`} className="rt-hint">
            {hint}
          </p>
        </div>
        <div className="rt-control">
          <div className="rt-stepper">
            <button
              type="button"
              aria-label={`${copy.less}: ${label}`}
              disabled={disabled || (Number.isFinite(value) && value <= min)}
              onClick={() => step(key, -1)}
            >
              <span aria-hidden="true">−</span>
            </button>
            <input
              ref={(el) => void (inputRefs.current[key] = el)}
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={values[key]}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              onChange={(e) => setValue(key, e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, [key]: true }))}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  step(key, e.key === "ArrowUp" ? 1 : -1);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
            />
            <span className="rt-unit" aria-hidden="true">
              {copy.unitMin}
            </span>
            <button
              type="button"
              aria-label={`${copy.more}: ${label}`}
              disabled={disabled || (Number.isFinite(value) && value >= max)}
              onClick={() => step(key, 1)}
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <span className="rt-equiv" aria-hidden={equiv ? undefined : true}>
            {equiv}
          </span>
        </div>
        {error ? (
          <p id={`${id}-error`} className="rt-error" role="alert">
            {error}
          </p>
        ) : warning ? (
          <p id={`${id}-warning`} className="rt-warning">
            {warning}
          </p>
        ) : null}
      </div>
    );
  }

  function timelineLabel(kind: TimelineKind): string {
    const labels = copy.preview.timeline;
    if (kind === "seat_from" && preview.session_start_before_min > preview.release_before_min) {
      return labels.seat_from_if_free;
    }
    if (kind === "start" && preview.hold_minutes === 0) return labels.start_no_hold;
    return labels[kind];
  }

  const timesShown =
    starts.length > PREVIEW_TIMES_HEAD + PREVIEW_TIMES_TAIL
      ? { head: starts.slice(0, PREVIEW_TIMES_HEAD), tail: starts.slice(-PREVIEW_TIMES_TAIL) }
      : { head: starts, tail: [] as number[] };

  let barText: string | null = null;
  let barTone: "info" | "ok" | "error" = "info";
  if (notice?.kind === "error") {
    barText = notice.text;
    barTone = "error";
  } else if (submitted && errors.length > 0) {
    barText = copy.bar.fixErrors;
    barTone = "error";
  } else if (notice?.kind === "saved" && !dirty) {
    barText = copy.bar.saved.replace(
      "{time}",
      notice.at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    );
    barTone = "ok";
  } else if (notice?.kind === "defaults" && dirty) {
    barText = copy.defaultsApplied;
  } else if (dirty) {
    barText = plural(locale, changeCount, copy.bar.unsaved);
  }

  return (
    <div ref={rootRef} className={`rt${readOnly ? " rt-readonly" : ""}`}>
      <section className="owner-card rt-intro">
        <p className="rt-lead">{copy.lead}</p>
        <div className="rt-intro-row">
          {phase === "ready" ? (
            <p className="rt-hours">
              <span className="rt-hours-icon">
                <GroupIcon id="time" />
              </span>
              <span>
                <b>{copy.hours}:</b> {hoursLabel}
                <small>{copy.hoursHint}</small>
              </span>
            </p>
          ) : (
            // Keeps the actions on the right while the hours are not known yet.
            <span />
          )}
          {published ? (
            <div className="rt-intro-actions">
              <a className="rt-action" href={`/venues/${encodeURIComponent(venueId)}`} target="_blank" rel="noreferrer">
                <span>{copy.openPage}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 4h6v6" />
                  <path d="M20 4 10 14" />
                  <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
              <button
                type="button"
                className="rt-action"
                disabled={phase !== "ready" || saving || atDefaults}
                onClick={fillDefaults}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <span>{copy.resetDefaults}</span>
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {readOnly ? (
        <div className="rt-banner" role="note">
          <strong>{copy.draftTitle}</strong>
          <p>{copy.draftText}</p>
        </div>
      ) : null}

      {phase === "loading" ? (
        <div className="rt-skeleton" role="status" aria-live="polite">
          <span className="rt-sr">{copy.loading}</span>
          <i />
          <i />
          <i />
        </div>
      ) : phase === "error" ? (
        <section className="owner-card rt-load-error" role="alert">
          <strong>{copy.loadFailedTitle}</strong>
          <p>{copy.loadFailedText}</p>
          <button
            type="button"
            className="panel-btn ghost"
            onClick={() => {
              setPhase("loading");
              setReloadKey((k) => k + 1);
            }}
          >
            {copy.retry}
          </button>
        </section>
      ) : (
        <>
          <div className="rt-layout">
            <div className="rt-groups">
              {GROUPS.map((group) => {
                const [title, subtitle] = copy.groups[group.id];
                return (
                  <section key={group.id} className="owner-card rt-group" aria-labelledby={`rules-group-${group.id}`}>
                    <header className="rt-group-head">
                      <span className="rt-group-icon">
                        <GroupIcon id={group.id} />
                      </span>
                      <div>
                        <h3 id={`rules-group-${group.id}`}>{title}</h3>
                        <p>{subtitle}</p>
                      </div>
                    </header>
                    {group.id === "preorder" ? (
                      <div className="rt-switch-row">
                        <button
                          type="button"
                          role="switch"
                          id="rules-allow-preorder"
                          className="rt-switch"
                          aria-checked={preorder}
                          disabled={readOnly || saving}
                          onClick={() => {
                            setPreorder((on) => !on);
                            if (notice?.kind !== "defaults") setNotice(null);
                          }}
                        >
                          <i aria-hidden="true" />
                        </button>
                        <label htmlFor="rules-allow-preorder" className="rt-label">
                          {copy.preorderToggle}
                          {preorderChanged ? (
                            <span className="rt-changed" title={copy.changed}>
                              <span className="rt-sr">{copy.changed}</span>
                            </span>
                          ) : null}
                        </label>
                      </div>
                    ) : null}
                    {group.id === "preorder" && !preorder ? <p className="rt-hint rt-off-note">{copy.preorderOff}</p> : null}
                    <div className="rt-fields">{group.keys.map((key) => field(key))}</div>
                  </section>
                );
              })}
            </div>

            <aside className="owner-card rt-preview" aria-labelledby="rules-preview-title">
              <h3 id="rules-preview-title">{copy.preview.title}</h3>
              <p className="rt-preview-sub">
                {copy.preview.example
                  .replace("{time}", clock(exampleAt))
                  .replace("{duration}", guestDuration(preview.visit_duration_min))}
              </p>
              <ol className="rt-timeline">
                {timeline.map((event) => (
                  <li key={event.kind} className={`rt-tl-${event.kind}`}>
                    <time>{clock(event.at)}</time>
                    <span>{timelineLabel(event.kind)}</span>
                  </li>
                ))}
              </ol>

              <div className="rt-preview-block">
                <h4>{copy.preview.bookingWindow}</h4>
                <p className="rt-mini-label">{copy.preview.durations}</p>
                <div className="rt-demo-chips">
                  {durations.map((min) => (
                    <span key={min} className={min === preview.visit_duration_min ? "on" : ""}>
                      {guestDuration(min)}
                    </span>
                  ))}
                </div>
                <p className="rt-mini-label">
                  {copy.preview.times}
                  {starts.length ? (
                    <span>
                      {" · "}
                      {copy.preview.timesStep.replace("{step}", minutes(preview.booking_interval_min))}
                      {" · "}
                      {plural(locale, starts.length, copy.preview.timesCount)}
                    </span>
                  ) : null}
                </p>
                {starts.length ? (
                  <div className="rt-demo-chips">
                    {timesShown.head.map((m) => (
                      <span key={m}>{clock(m)}</span>
                    ))}
                    {timesShown.tail.length ? <span className="rt-gap">…</span> : null}
                    {timesShown.tail.map((m) => (
                      <span key={m}>{clock(m)}</span>
                    ))}
                  </div>
                ) : (
                  <p className="rt-warning">{copy.preview.timesNone}</p>
                )}
                <BookingRulesNote rules={preview} />
              </div>

              <details className="rt-preview-rules">
                <summary>{copy.preview.rulesList}</summary>
                <VenueBookingRules rules={preview} allowPreorder={preorder} compact />
              </details>
            </aside>

            <section className="owner-card rt-platform" aria-labelledby="rules-platform-title">
              <h3 id="rules-platform-title">{copy.platform.title}</h3>
              <p className="rt-hint">{copy.platform.note}</p>
              <ul>
                <li>{copy.platform.window.replace("{days}", String(BOOKING_DAYS_AHEAD))}</li>
                <li>{copy.platform.notice.replace("{min}", String(MIN_LEAD_MIN))}</li>
                <li>{copy.platform.oneActive}</li>
                <li>{copy.platform.party}</li>
                <li>{copy.platform.cancel}</li>
              </ul>
            </section>
          </div>

          {readOnly || (!dirty && !saving && !barText) ? null : (
            <div className={`rt-bar${dirty || saving ? " dirty" : ""}`}>
              <p className={`rt-bar-status ${barTone}`} role={barTone === "error" ? "alert" : undefined}>
                {barText}
              </p>
              {dirty || saving ? (
                <div className="rt-bar-actions">
                  <button type="button" className="panel-btn ghost" disabled={saving} onClick={discard}>
                    {copy.bar.discard}
                  </button>
                  <button type="button" className="panel-btn" disabled={saving} onClick={() => void save()}>
                    {saving ? copy.bar.saving : copy.bar.save}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* Stays mounted so screen readers hear "saved" / "unsaved" even when the bar comes and goes. */}
      <p className="rt-sr" role="status" aria-live="polite">
        {barTone === "error" ? "" : barText}
      </p>

      <CabinetConfirmDialog
        open={leaveResume !== null}
        tone="warning"
        title={copy.leave.title}
        text={copy.leave.text}
        confirmLabel={copy.leave.confirm}
        cancelLabel={copy.leave.cancel}
        onConfirm={() => {
          const resume = leaveResume;
          setLeaveResume(null);
          resume?.();
        }}
        onCancel={() => setLeaveResume(null)}
      />
    </div>
  );
}
