"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, type MessageKey } from "@/components/locale-provider";
import {
  ApiError,
  createEventInquiry,
  fetchMe,
  getToken,
  pickLocale,
  type EventInquiry,
  type Venue,
} from "@/lib/api";
import { AuthForm } from "@/components/auth-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { DayPicker } from "@/components/ui/day-picker";
import { ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal-shell";
import { ScrollerFade } from "@/components/ui/scroller-fade";
import { addDays, sameDay, startOfDay } from "@/lib/date-picker";
import { venueHoursOn } from "@/lib/venue-hours";
import {
  EVENT_DURATIONS_MIN,
  EVENT_MAX_GUESTS,
  EVENT_PRESET_IDS,
  EVENT_TIMES,
  apiEventType,
  clampGuests,
  editDraft,
  findPreset,
  firstMissing,
  initialPresetState,
  preferredDateIso,
  selectPreset,
  stepGuests,
  type EventFormError,
  type EventPreset,
  type EventPresetId,
} from "@/lib/event-presets";

/** Banquet dates can be picked up to a year ahead. */
const EVENT_DAYS_AHEAD = 365;
/** A start time must leave at least this long before closing. */
const MIN_EVENT_OPEN_MIN = 60;

const PRESET_LABEL: Record<EventPresetId, MessageKey> = {
  custom: "banquet.preset_custom",
  birthday: "banquet.preset_birthday",
  corporate: "banquet.preset_corporate",
  wedding: "banquet.preset_wedding",
  anniversary: "banquet.preset_anniversary",
  lunch: "banquet.preset_lunch",
};
const PRESET_NOTES: Record<EventPreset["id"], MessageKey> = {
  birthday: "banquet.notes_birthday",
  corporate: "banquet.notes_corporate",
  wedding: "banquet.notes_wedding",
  anniversary: "banquet.notes_anniversary",
  lunch: "banquet.notes_lunch",
};
const PRESET_ICON: Record<EventPresetId, string> = {
  custom: "✎",
  birthday: "🎂",
  corporate: "💼",
  wedding: "💍",
  anniversary: "🥂",
  lunch: "🥗",
};
const ERROR_KEY: Record<EventFormError, MessageKey> = {
  guests: "banquet.error_guests",
  date: "banquet.error_date",
  time: "banquet.error_time",
  name: "event.error_name",
  phone: "event.error_phone",
};

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function EventInquiryForm({
  venue,
  onClose,
  titleId,
}: {
  venue: Venue;
  /** × in the header and "back to tables" after sending. */
  onClose: () => void;
  /** id for the heading (dialog aria-labelledby). */
  titleId?: string;
}) {
  const { locale, t } = useLocale();
  const [presets, setPresets] = useState(initialPresetState);
  const [day, setDay] = useState<Date | null>(null);
  const [contactMethod, setContactMethod] = useState<"chat" | "call">("chat");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [prefilled, setPrefilled] = useState({ name: false, phone: false });
  const [step, setStep] = useState<"form" | "auth">("form");
  const [success, setSuccess] = useState<EventInquiry | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const draft = presets.draft;

  const venueName = pickLocale(venue.name, locale);
  const eventPhone = (venue.event_phone || venue.phone || "").trim();
  const eventTelegram = (venue.event_telegram || "").trim().replace(/^@/, "");
  const today = useMemo(() => startOfDay(new Date()), []);
  const lastDay = useMemo(() => addDays(today, EVENT_DAYS_AHEAD), [today]);
  const ownHours = useMemo(() => ({ id: venue.id, hours_text: venue.hours_text }), [venue.id, venue.hours_text]);
  const hoursOfDay = day ? venueHoursOn(ownHours, day) : null;

  // Latest typed contacts, so a late account answer never overwrites what the guest typed.
  const contactRef = useRef({ name: "", phone: "" });
  useEffect(() => {
    contactRef.current = { name: contactName, phone: contactPhone };
  }, [contactName, contactPhone]);

  /** Signed-in guests get their name and phone from the account (still editable). */
  function prefillFromAccount() {
    if (!getToken()) return;
    void fetchMe()
      .then((user) => {
        const name = (user.display_name || `${user.first_name} ${user.last_name}`).trim();
        const phone = (user.phone ?? "").trim();
        const fillName = Boolean(name) && !contactRef.current.name.trim();
        const fillPhone = Boolean(phone) && !contactRef.current.phone.trim();
        if (fillName) setContactName(name);
        if (fillPhone) setContactPhone(phone);
        if (fillName || fillPhone) setPrefilled((p) => ({ name: p.name || fillName, phone: p.phone || fillPhone }));
      })
      .catch(() => {
        /* not signed in any more: the guest types them */
      });
  }

  useEffect(() => {
    // Once, when the form opens.
    prefillFromAccount();
  }, []);

  useEffect(() => {
    if (errorKey) errorRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [errorKey]);

  const formatDuration = (min: number) =>
    min % 60 === 0 || min % 30 === 0
      ? t("res.duration_hours", { h: (min / 60).toLocaleString(locale, { maximumFractionDigits: 1 }) })
      : t("res.duration_minutes", { min });

  function timeAllowed(time: string): boolean {
    if (!day) return true;
    if (!hoursOfDay) return false;
    const start = minutesOf(time);
    if (start < hoursOfDay.openMin || start + MIN_EVENT_OPEN_MIN > hoursOfDay.closeMin) return false;
    if (sameDay(day, today)) {
      const now = new Date();
      if (start < now.getHours() * 60 + now.getMinutes() + MIN_EVENT_OPEN_MIN) return false;
    }
    return true;
  }

  function pickPreset(id: EventPresetId) {
    setErrorKey(null);
    setPresets((state) => selectPreset(state, id, (presetId) => t(PRESET_NOTES[presetId])));
  }

  function update(patch: Parameters<typeof editDraft>[1]) {
    setErrorKey(null);
    setPresets((state) => editDraft(state, patch));
  }

  function validate(): boolean {
    const missing = firstMissing({ day, time: draft.time, guests: draft.guests, name: contactName, phone: contactPhone });
    if (missing) {
      setErrorKey(ERROR_KEY[missing]);
      return false;
    }
    if (draft.time && !timeAllowed(draft.time)) {
      setErrorKey("banquet.error_time");
      return false;
    }
    return true;
  }

  async function send() {
    setErrorKey(null);
    if (!validate()) return;
    if (!getToken()) {
      setStep("auth");
      return;
    }
    const preferred = preferredDateIso(day, draft.time);
    if (!preferred || draft.guests == null) return;
    // No duration field in the API yet (BACKEND_TASKS №64): it goes first in the wishes.
    const notes = [
      draft.durationMin ? t("banquet.duration_note", { d: formatDuration(draft.durationMin) }) : "",
      draft.notes.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    setBusy(true);
    try {
      const inquiry = await createEventInquiry({
        venue_id: venue.id,
        event_type: apiEventType(presets.preset),
        guest_count: draft.guests,
        preferred_date: preferred,
        contact_method: contactMethod,
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        notes,
      });
      setSuccess(inquiry);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        setStep("auth");
      } else {
        setErrorKey("event.error_submit");
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  const summary =
    day && draft.time
      ? [
          `${day.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}, ${draft.time}`,
          draft.guests ? t("banquet.summary_guests", { n: draft.guests }) : null,
          draft.durationMin ? formatDuration(draft.durationMin) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : t("banquet.summary_empty");

  if (success) {
    return (
      <div className="mshell-content event-form">
        <ModalHeader
          kicker={t("event.success_badge")}
          title={t("event.success_title")}
          titleId={titleId}
          subtitle={venueName}
          onClose={onClose}
        />
        <ModalBody className="event-form-body">
          <p className="event-success-lead">
            {t("event.success_lead", {
              venue: venueName,
              method:
                success.contact_method === "chat"
                  ? t("event.success_method_chat")
                  : t("event.success_method_call"),
            })}
          </p>
          {success.preferred_date ? (
            <p className="bk-slot-pill">
              <i aria-hidden="true" />
              <span>
                {new Date(success.preferred_date).toLocaleString(locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {t("banquet.summary_guests", { n: success.guest_count })}
              </span>
            </p>
          ) : null}
          {/* The venue's own event contacts (BACKEND_TASKS №62); no block until the venue has them. */}
          {eventPhone || eventTelegram ? (
            <div className="event-success-contacts">
              <span className="booking-field-label">{t("event.venue_contacts_title")}</span>
              <div>
                {eventTelegram ? (
                  <a
                    href={`https://t.me/${eventTelegram}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--secondary btn--md"
                  >
                    <span className="btn-content">{t("event.telegram_btn")}</span>
                  </a>
                ) : null}
                {eventPhone ? (
                  <a href={`tel:${eventPhone.replace(/[^\d+]/g, "")}`} className="btn btn--secondary btn--md">
                    <span className="btn-content">{t("event.call_venue", { phone: eventPhone })}</span>
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="md" className="is-desktop-only" onClick={onClose}>
            {t("res.close")}
          </Button>
          <ButtonLink href="/account" variant="primary" size="md">
            {t("event.my_bookings_btn")}
          </ButtonLink>
        </ModalFooter>
      </div>
    );
  }

  if (step === "auth") {
    return (
      <div className="mshell-content event-form">
        <ModalHeader
          kicker={t("banquet.kicker")}
          step={t("booking.step", { n: 2, total: 2 })}
          title={t("banquet.auth_title")}
          titleId={titleId}
          subtitle={venueName}
          onClose={onClose}
        />
        <ModalBody className="event-form-body">
          <p className="bk-slot-pill" role="status">
            <i aria-hidden="true" />
            <span>
              <strong>{venueName}</strong> · {summary}
            </span>
          </p>
          <div className="bk-auth">
            <AuthForm
              initialMode="register"
              hint={t("banquet.auth_hint")}
              onSuccess={() => {
                setStep("form");
                prefillFromAccount();
                void send();
              }}
            />
          </div>
        </ModalBody>
        <ModalFooter summary={summary}>
          <Button variant="secondary" size="md" onClick={() => setStep("form")}>
            ← {t("common.back")}
          </Button>
        </ModalFooter>
      </div>
    );
  }

  return (
    <form className="mshell-content event-form" onSubmit={onSubmit} noValidate>
      <ModalHeader
        kicker={t("banquet.kicker")}
        title={t("banquet.title")}
        titleId={titleId}
        subtitle={t("banquet.subtitle")}
        onClose={onClose}
      />
      <ModalBody className="event-form-body">
        <div className="booking-field">
          <span className="booking-field-label" id="event-presets-label">
            {t("banquet.presets_label")}
          </span>
          <ScrollerFade
            trackClassName="event-presets"
            role="radiogroup"
            ariaLabelledBy="event-presets-label"
            activeKey={presets.preset}
          >
            {EVENT_PRESET_IDS.map((id) => {
              const preset = findPreset(id);
              const active = presets.preset === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`event-preset${active ? " is-active" : ""}`}
                  onClick={() => pickPreset(id)}
                >
                  <span className="event-preset-icon" aria-hidden="true">
                    {PRESET_ICON[id]}
                  </span>
                  <span className="event-preset-text">
                    <strong>{t(PRESET_LABEL[id])}</strong>
                    <small>
                      {preset
                        ? t("banquet.preset_meta", { guests: preset.guests, duration: formatDuration(preset.durationMin) })
                        : t("banquet.preset_custom_meta")}
                    </small>
                  </span>
                </button>
              );
            })}
          </ScrollerFade>
        </div>

        <div className="bk-grid-2">
          <div className="booking-field">
            <label className="booking-field-label" htmlFor="event-guests">
              {t("banquet.guests")}
            </label>
            <div className="booking-stepper bk-stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label={t("banquet.guests_less")}
                onClick={() => update({ guests: stepGuests(draft.guests, -1) })}
              >
                −
              </button>
              <input
                id="event-guests"
                type="text"
                inputMode="numeric"
                placeholder="—"
                value={draft.guests ?? ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  update({ guests: digits ? Math.min(EVENT_MAX_GUESTS, Number(digits)) : null });
                }}
                onBlur={() => {
                  if (draft.guests != null) update({ guests: clampGuests(draft.guests) });
                }}
              />
              <button
                type="button"
                className="stepper-btn"
                aria-label={t("banquet.guests_more")}
                onClick={() => update({ guests: stepGuests(draft.guests, 1) })}
              >
                +
              </button>
            </div>
          </div>
          <div className="booking-field">
            <span className="booking-field-label" id="event-duration-label">
              {t("banquet.duration")}
            </span>
            <ScrollerFade trackClassName="bk-chips" ariaLabelledBy="event-duration-label" activeKey={draft.durationMin}>
              {EVENT_DURATIONS_MIN.map((min) => (
                <button
                  key={min}
                  type="button"
                  className={`chip${draft.durationMin === min ? " is-active" : ""}`}
                  aria-pressed={draft.durationMin === min}
                  onClick={() => update({ durationMin: draft.durationMin === min ? null : min })}
                >
                  {formatDuration(min)}
                </button>
              ))}
            </ScrollerFade>
          </div>
        </div>

        <DayPicker
          label={t("banquet.day")}
          min={today}
          max={lastDay}
          value={day}
          onChange={(next) => {
            setErrorKey(null);
            setDay(next);
          }}
          isClosed={(d) => !venueHoursOn(ownHours, d)}
          hasFree={(d) => Boolean(venueHoursOn(ownHours, d))}
          dotLabel={t("picker.legend_open")}
        />

        <div className="booking-field">
          <span className="booking-field-label" id="event-time-label">
            {t("banquet.time")}
          </span>
          <ScrollerFade trackClassName="bk-chips" ariaLabelledBy="event-time-label" activeKey={draft.time}>
            {EVENT_TIMES.map((time) => {
              const allowed = timeAllowed(time);
              return (
                <button
                  key={time}
                  type="button"
                  className={`chip${draft.time === time ? " is-active" : ""}`}
                  aria-pressed={draft.time === time}
                  disabled={!allowed}
                  title={allowed ? undefined : t("banquet.time_closed")}
                  onClick={() => update({ time })}
                >
                  {time}
                </button>
              );
            })}
          </ScrollerFade>
        </div>

        <div className="booking-field">
          <span className="booking-field-label">{t("banquet.contact")}</span>
          <div className="event-methods">
            {(["chat", "call"] as const).map((method) => (
              <button
                key={method}
                type="button"
                className={`event-method${contactMethod === method ? " on" : ""}`}
                aria-pressed={contactMethod === method}
                onClick={() => setContactMethod(method)}
              >
                <strong>{t(method === "chat" ? "banquet.method_chat" : "banquet.method_call")}</strong>
                <span>{t(method === "chat" ? "banquet.method_chat_desc" : "banquet.method_call_desc")}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bk-grid-2">
          <div className="booking-field">
            <label className="booking-field-label event-label-row" htmlFor="event-contact-name">
              <span>{t("banquet.name")}</span>
              {prefilled.name ? <small>{t("banquet.prefilled")}</small> : null}
            </label>
            <input
              id="event-contact-name"
              type="text"
              autoComplete="name"
              className="event-input"
              placeholder={t("event.name_placeholder")}
              value={contactName}
              onChange={(e) => {
                setErrorKey(null);
                setContactName(e.target.value);
              }}
            />
          </div>
          <div className="booking-field">
            <label className="booking-field-label event-label-row" htmlFor="event-contact-phone">
              <span>{t("banquet.phone")}</span>
              {prefilled.phone ? <small>{t("banquet.prefilled")}</small> : null}
            </label>
            <input
              id="event-contact-phone"
              type="tel"
              autoComplete="tel"
              className="event-input"
              placeholder={t("event.phone_placeholder")}
              value={contactPhone}
              onChange={(e) => {
                setErrorKey(null);
                setContactPhone(e.target.value);
              }}
            />
          </div>
        </div>

        <div className="booking-field">
          <label className="booking-field-label" htmlFor="event-notes">
            {t("banquet.notes")}
          </label>
          <textarea
            id="event-notes"
            rows={3}
            maxLength={600}
            className="event-input"
            placeholder={t("event.notes_placeholder")}
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </div>

        {errorKey ? (
          <p ref={errorRef} className="web-book-error" role="alert">
            {t(errorKey)}
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter summary={summary}>
        <Button variant="ghost" size="md" className="is-desktop-only" onClick={onClose}>
          {t("res.close")}
        </Button>
        <Button type="submit" size="md" loading={busy}>
          {t("banquet.submit")}
        </Button>
      </ModalFooter>
    </form>
  );
}

