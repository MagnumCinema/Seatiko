"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { fetchVenue, updateBookingRules, type Venue } from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";
import {
  BOOKING_RULE_KEYS,
  BOOKING_RULE_LIMITS,
  DEFAULT_BOOKING_RULES,
  resolveBookingRules,
  validateBookingRules,
  type BookingRuleKey,
  type BookingRules,
} from "@/lib/venue-rules";

/** Input step per rule; labels and hints come from site-copy (cabinet.ui.rulesFields). */
const RULE_STEPS: Record<BookingRuleKey, number> = {
  booking_interval_min: 15,
  visit_duration_min: 15,
  max_visit_duration_min: 30,
  hold_minutes: 5,
  max_late_arrival_min: 5,
  session_start_before_min: 5,
  release_before_min: 5,
};

const RULE_ORDER: BookingRuleKey[] = [
  "booking_interval_min",
  "visit_duration_min",
  "max_visit_duration_min",
  "hold_minutes",
  "max_late_arrival_min",
  "session_start_before_min",
  "release_before_min",
];

type FormValues = Record<BookingRuleKey, string>;

function rulesToFormValues(rules: BookingRules): FormValues {
  return {
    booking_interval_min: String(rules.booking_interval_min),
    visit_duration_min: String(rules.visit_duration_min),
    max_visit_duration_min: String(rules.max_visit_duration_min),
    hold_minutes: String(rules.hold_minutes),
    max_late_arrival_min: String(rules.max_late_arrival_min),
    session_start_before_min: String(rules.session_start_before_min),
    release_before_min: String(rules.release_before_min),
  };
}

export function BookingRulesForm({ venueId }: { venueId: string }) {
  const { locale } = useLocale();
  const ui = getSiteCopy(locale).cabinet.ui;
  const [values, setValues] = useState<FormValues>(() =>
    rulesToFormValues(DEFAULT_BOOKING_RULES)
  );
  const [allowPreorder, setAllowPreorder] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<BookingRuleKey, string>>>({});
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  function populateFromVenue(venue: Partial<Venue> | null | undefined) {
    const rules = resolveBookingRules(venue);
    setValues(rulesToFormValues(rules));
    setAllowPreorder(venue?.allow_preorder ?? true);
    setDirty(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const venue = await fetchVenue(venueId);
        if (cancelled) return;
        populateFromVenue(venue);
      } catch {
        // Defaults stay in the form, but the owner is told they are not the saved values.
        if (!cancelled) setLoadFailed(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  function handleChange(key: BookingRuleKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    if (status) {
      setStatus(null);
    }
  }

  async function handleSave() {
    const numericRules = {} as BookingRules;
    for (const key of BOOKING_RULE_KEYS) {
      const raw = values[key]?.trim() ?? "";
      numericRules[key] = raw === "" ? NaN : Number(raw);
    }

    const validationErrors = validateBookingRules(numericRules);
    if (validationErrors.length > 0) {
      const nextErrors: Partial<Record<BookingRuleKey, string>> = {};
      for (const err of validationErrors) {
        if (err.reason === "range") {
          const { min, max } = BOOKING_RULE_LIMITS[err.key];
          nextErrors[err.key] = ui.rulesRange.replace("{min}", String(min)).replace("{max}", String(max));
        } else if (err.reason === "below_hold") {
          const hold = Number.isFinite(numericRules.hold_minutes)
            ? numericRules.hold_minutes
            : values.hold_minutes;
          nextErrors[err.key] = ui.rulesBelowHold.replace("{hold}", String(hold));
        } else if (err.reason === "above_max") {
          nextErrors[err.key] = ui.rulesAboveMax.replace("{max}", String(values.max_visit_duration_min));
        }
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaving(true);
    setStatus(null);

    try {
      const updated = await updateBookingRules(venueId, {
        ...numericRules,
        allow_preorder: allowPreorder,
      });
      populateFromVenue(updated);
      setLoadFailed(false);
      setStatus({ kind: "success", text: ui.rulesSaved });
    } catch {
      setStatus({ kind: "error", text: ui.rulesSaveFailed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="booking-rules-form">
      {loadFailed && (
        <p className="booking-rules-status error" role="alert">
          {ui.rulesLoadFailed}
        </p>
      )}
      <div className="booking-rules-grid">
        {RULE_ORDER.map((key) => {
          const { min, max } = BOOKING_RULE_LIMITS[key];
          const error = errors[key];
          const [label, hint] = ui.rulesFields[key];
          return (
            <label key={key} className="booking-rules-field">
              <span className="booking-rules-label">{label}</span>
              <input
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step={RULE_STEPS[key]}
                value={values[key]}
                aria-invalid={error ? true : undefined}
                onChange={(e) => handleChange(key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSave();
                  }
                }}
              />
              <small className="booking-rules-hint">{hint}</small>
              {error && (
                <small className="booking-rules-error" role="alert">
                  {error}
                </small>
              )}
            </label>
          );
        })}
      </div>

      <label className="booking-rules-field booking-rules-check">
        <input
          type="checkbox"
          checked={allowPreorder}
          onChange={(e) => {
            setAllowPreorder(e.target.checked);
            setDirty(true);
            if (status) setStatus(null);
          }}
        />
        <span className="booking-rules-label">{ui.rulesPreorder}</span>
      </label>

      <div className="booking-rules-preview">
        <strong>{ui.rulesPreviewLabel}</strong>
        <p>
          {ui.rulesPreview
            .replace("{hold}", values.hold_minutes || "0")
            .replace("{late}", values.max_late_arrival_min || "0")
            .replace("{max}", values.max_visit_duration_min || "0")
            .replace("{def}", values.visit_duration_min || "0")}
        </p>
      </div>

      <div className="booking-rules-actions">
        <button
          type="button"
          className="panel-btn"
          disabled={saving || !dirty}
          onClick={() => void handleSave()}
        >
          {ui.rulesSave}
        </button>
        {status ? (
          <p className={`booking-rules-status ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
            {status.text}
          </p>
        ) : dirty ? (
          <p className="booking-rules-dirty">{ui.rulesUnsaved}</p>
        ) : null}
      </div>
    </section>
  );
}
