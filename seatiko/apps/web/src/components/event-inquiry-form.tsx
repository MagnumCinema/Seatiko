"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  ApiError,
  createEventInquiry,
  getToken,
  pickLocale,
  type EventInquiry,
  type Venue,
} from "@/lib/api";

const EVENT_TYPES = [
  { id: "birthday", labelKey: "event.type_birthday" },
  { id: "banquet", labelKey: "event.type_banquet" },
  { id: "corporate", labelKey: "event.type_corporate" },
  { id: "romantic", labelKey: "event.type_romantic" },
  { id: "other", labelKey: "event.type_other" },
] as const;

function getDefaultPreferredDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function EventInquiryForm({
  venue,
  onAuthRequired,
  onBackToTables,
  titleId,
}: {
  venue: Venue;
  onAuthRequired: () => void;
  onBackToTables: () => void;
  /** id for the heading (dialog aria-labelledby). */
  titleId?: string;
}) {
  const { locale, t } = useLocale();

  const [eventType, setEventType] = useState<string>("birthday");
  const [eventGuests, setEventGuests] = useState<number>(10);
  const [eventDate, setEventDate] = useState<string>(() =>
    getDefaultPreferredDate(),
  );
  const [contactMethod, setContactMethod] = useState<"chat" | "call">("chat");
  const [contactName, setContactName] = useState<string>("");
  const [contactPhone, setContactPhone] = useState<string>("");
  const [eventNotes, setEventNotes] = useState<string>("");
  const [eventSuccess, setEventSuccess] = useState<EventInquiry | null>(null);
  const [eventBusy, setEventBusy] = useState<boolean>(false);
  const [eventError, setEventError] = useState<string | null>(null);

  const venueName = pickLocale(venue.name, locale);
  const eventPhone = (venue.event_phone || venue.phone || "").trim();
  const eventTelegram = (venue.event_telegram || "").trim().replace(/^@/, "");

  async function handleEventInquirySubmit(e: React.FormEvent) {
    e.preventDefault();
    setEventError(null);

    if (!getToken()) {
      onAuthRequired();
      return;
    }

    if (!contactName.trim()) {
      setEventError(t("event.error_name"));
      return;
    }
    if (!contactPhone.trim()) {
      setEventError(t("event.error_phone"));
      return;
    }

    setEventBusy(true);
    try {
      const inq = await createEventInquiry({
        venue_id: venue.id,
        event_type: eventType,
        guest_count: eventGuests,
        preferred_date: new Date(eventDate).toISOString(),
        contact_method: contactMethod,
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        notes: eventNotes.trim(),
      });
      setEventSuccess(inq);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthRequired();
      } else {
        setEventError(t("event.error_submit"));
      }
    } finally {
      setEventBusy(false);
    }
  }

  return (
    <section className="event-booking">
      {eventSuccess ? (
        <div className="event-booking-card">
          <span className="event-success-badge">{t("event.success_badge")}</span>
          <h2 id={titleId}>{t("event.success_title")}</h2>
          <p>
            {t("event.success_lead", {
              venue: venueName,
              method:
                eventSuccess.contact_method === "chat"
                  ? t("event.success_method_chat")
                  : t("event.success_method_call"),
            })}
          </p>

          {eventSuccess.preferred_date ? (
            <p>
              <span className="booking-field-label">
                {t("event.date_label")}
              </span>{" "}
              <span>
                {new Date(eventSuccess.preferred_date).toLocaleString(locale)}
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
                    {t("event.telegram_btn")}
                  </a>
                ) : null}
                {eventPhone ? (
                  <a
                    href={`tel:${eventPhone.replace(/[^\d+]/g, "")}`}
                    className="btn btn--secondary btn--md"
                  >
                    {t("event.call_venue", { phone: eventPhone })}
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="event-success-actions">
            <button
              type="button"
              className="btn btn--ghost btn--md"
              onClick={() => {
                setEventSuccess(null);
                onBackToTables();
              }}
            >
              {t("event.back_to_tables")}
            </button>
            <Link href="/account" className="btn btn--secondary btn--md">
              {t("event.my_bookings_btn")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="event-booking-card">
          <div>
            <h2 id={titleId}>{t("event.title")}</h2>
            <p>{t("event.subtitle")}</p>
          </div>

          <form onSubmit={handleEventInquirySubmit}>
            {eventError && (
              <p className="web-book-error" role="alert">
                {eventError}
              </p>
            )}

            <div>
              <span className="booking-field-label">
                {t("event.type_label")}
              </span>
              <div className="booking-slot-days">
                {EVENT_TYPES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`chip${eventType === item.id ? " is-active" : ""}`}
                    aria-pressed={eventType === item.id}
                    onClick={() => setEventType(item.id)}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="event-grid">
              <div className="event-field">
                <label htmlFor="event-guests">
                  <span className="booking-field-label">
                    {t("event.guests_label")}
                  </span>
                </label>
                <input
                  id="event-guests"
                  type="number"
                  min={4}
                  max={120}
                  className="event-input"
                  value={eventGuests}
                  onChange={(e) =>
                    setEventGuests(Number(e.target.value) || 4)
                  }
                />
                <span className="event-field-hint">{t("event.guests_hint")}</span>
              </div>

              <div className="event-field">
                <label htmlFor="event-date">
                  <span className="booking-field-label">
                    {t("event.date_label")}
                  </span>
                </label>
                <input
                  id="event-date"
                  type="datetime-local"
                  className="event-input"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <span className="booking-field-label">
                {t("event.contact_method_label")}
              </span>
              <div className="event-methods">
                <button
                  type="button"
                  className={`event-method${contactMethod === "chat" ? " on" : ""}`}
                  aria-pressed={contactMethod === "chat"}
                  onClick={() => setContactMethod("chat")}
                >
                  <strong>{t("event.method_chat_title")}</strong>
                  <span>{t("event.method_chat_desc")}</span>
                </button>

                <button
                  type="button"
                  className={`event-method${contactMethod === "call" ? " on" : ""}`}
                  aria-pressed={contactMethod === "call"}
                  onClick={() => setContactMethod("call")}
                >
                  <strong>{t("event.method_call_title")}</strong>
                  <span>{t("event.method_call_desc")}</span>
                </button>
              </div>
            </div>

            <div className="event-grid">
              <div className="event-field">
                <label htmlFor="event-contact-name">
                  <span className="booking-field-label">
                    {t("event.name_label")}
                  </span>
                </label>
                <input
                  id="event-contact-name"
                  type="text"
                  className="event-input"
                  placeholder={t("event.name_placeholder")}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>

              <div className="event-field">
                <label htmlFor="event-contact-phone">
                  <span className="booking-field-label">
                    {t("event.phone_label")}
                  </span>
                </label>
                <input
                  id="event-contact-phone"
                  type="tel"
                  className="event-input"
                  placeholder={t("event.phone_placeholder")}
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="event-field">
              <label htmlFor="event-notes">
                <span className="booking-field-label">
                  {t("event.notes_label")}
                </span>
              </label>
              <textarea
                id="event-notes"
                rows={3}
                className="event-input"
                placeholder={t("event.notes_placeholder")}
                value={eventNotes}
                onChange={(e) => setEventNotes(e.target.value)}
              />
            </div>

            <div>
              <button
                type="submit"
                className="btn btn--primary btn--lg"
                disabled={eventBusy}
              >
                {eventBusy ? t("event.submitting") : t("event.submit")}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
