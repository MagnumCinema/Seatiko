"use client";

import { useEffect, useState } from "react";
import { fetchVenue, updateBookingRules, type Venue } from "@/lib/api";
import {
  BOOKING_RULE_KEYS,
  BOOKING_RULE_LIMITS,
  DEFAULT_BOOKING_RULES,
  resolveBookingRules,
  validateBookingRules,
  type BookingRuleKey,
  type BookingRules,
} from "@/lib/venue-rules";

type RuleFieldConfig = {
  key: BookingRuleKey;
  label: string;
  hint: string;
  step: number;
};

const RULE_FIELDS: RuleFieldConfig[] = [
  {
    key: "booking_interval_min",
    label: "Шаг времени брони, мин",
    hint: "Через сколько минут можно выбрать следующее время (например 18:00, 18:30).",
    step: 15,
  },
  {
    key: "visit_duration_min",
    label: "Длительность брони по умолчанию, мин",
    hint: "Будет выбрана в окне брони заранее; гость может изменить её сам.",
    step: 15,
  },
  {
    key: "max_visit_duration_min",
    label: "Максимальная длительность брони, мин",
    hint: "Дольше этого гость забронировать стол не сможет.",
    step: 30,
  },
  {
    key: "hold_minutes",
    label: "Опоздание без предупреждения, мин",
    hint: "Сколько стол ждёт гостя после времени брони, если он ничего не отметил.",
    step: 5,
  },
  {
    key: "max_late_arrival_min",
    label: "Максимальное опоздание с предупреждением, мин",
    hint: "До скольких минут гость может опоздать, если отметил это в «Я приду». Не меньше опоздания без предупреждения.",
    step: 5,
  },
  {
    key: "session_start_before_min",
    label: "Посадка до брони, мин",
    hint: "За сколько минут до брони гость с бронью может сесть за стол.",
    step: 5,
  },
  {
    key: "release_before_min",
    label: "Освобождение для гостей без брони, мин",
    hint: "За сколько минут до брони гости без брони должны освободить стол.",
    step: 5,
  },
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
  const [values, setValues] = useState<FormValues>(() =>
    rulesToFormValues(DEFAULT_BOOKING_RULES)
  );
  const [allowPreorder, setAllowPreorder] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<BookingRuleKey, string>>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function populateFromVenue(venue: Partial<Venue> | null | undefined) {
    const rules = resolveBookingRules(venue);
    setValues(rulesToFormValues(rules));
    setAllowPreorder(venue?.allow_preorder ?? true);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const venue = await fetchVenue(venueId);
        if (cancelled) return;
        populateFromVenue(venue);
      } catch {
        /* ignore network errors on initial load, fallback to defaults */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  function handleChange(key: BookingRuleKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
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
          nextErrors[err.key] = `Допустимо от ${min} до ${max}`;
        } else if (err.reason === "below_hold") {
          const hold = Number.isFinite(numericRules.hold_minutes)
            ? numericRules.hold_minutes
            : values.hold_minutes;
          nextErrors[err.key] = `Должно быть не меньше опоздания без предупреждения (${hold} мин)`;
        } else if (err.reason === "above_max") {
          nextErrors[err.key] = `Не больше максимальной длительности (${values.max_visit_duration_min} мин)`;
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
      setStatus("Правила брони сохранены");
    } catch {
      setStatus("Не удалось сохранить правила");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="booking-rules-form">
      <div className="booking-rules-grid">
        {RULE_FIELDS.map((cfg) => {
          const { min, max } = BOOKING_RULE_LIMITS[cfg.key];
          const error = errors[cfg.key];
          return (
            <label key={cfg.key} className="booking-rules-field">
              <span className="booking-rules-label">{cfg.label}</span>
              <input
                type="number"
                min={min}
                max={max}
                step={cfg.step}
                value={values[cfg.key]}
                onChange={(e) => handleChange(cfg.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSave();
                  }
                }}
              />
              <small className="booking-rules-hint">{cfg.hint}</small>
              {error && (
                <small className="booking-rules-error" role="alert">
                  {error}
                </small>
              )}
            </label>
          );
        })}
      </div>

      <label className="booking-rules-field">
        <input
          type="checkbox"
          checked={allowPreorder}
          onChange={(e) => {
            setAllowPreorder(e.target.checked);
            if (status) setStatus(null);
          }}
        />
        <span className="booking-rules-label">
          Разрешить предзаказ блюд к брони
        </span>
      </label>

      <p className="booking-rules-preview">
        Гость увидит: без предупреждения можно опоздать на {values.hold_minutes || "0"} мин; предупредив — до {values.max_late_arrival_min || "0"} мин; длительность брони гость выбирает сам — до {values.max_visit_duration_min || "0"} мин (по умолчанию {values.visit_duration_min || "0"}).
      </p>

      {status && (
        <p className="booking-rules-status" role="status">
          {status}
        </p>
      )}

      <button
        type="button"
        className="fa-btn"
        disabled={saving}
        onClick={() => void handleSave()}
      >
        Сохранить
      </button>
    </section>
  );
}
