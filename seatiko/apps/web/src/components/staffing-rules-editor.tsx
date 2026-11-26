"use client";

import { fill, formatDate, weekdayNames, type CabinetCopy, type Locale } from "@/components/shift-ui";
import { addDays, ALL_WEEKDAYS, isWindowRule, STAFFING_MAX, type StaffingRule } from "@/lib/shift-schedule";
import { defaultRule, MAX_RULES_PER_ROLE } from "@/lib/staffing-store";
import "@/app/cabinet/shifts.css";

/** Short text of a role's minimums for the roles list: "минимум: 2/день, Пт–Сб 18:00–23:00 3". */
export function staffingSummary(rules: StaffingRule[], copy: CabinetCopy, locale: Locale): string {
  if (!rules.length) return "";
  const names = weekdayNames(locale);
  const parts = rules.map((r) => {
    const days = r.days.length === 7 ? "" : `${daysText(r.days, names)} `;
    if (isWindowRule(r)) return `${days}${r.from}–${r.to}: ${r.min}`;
    return `${days}${fill(copy.shiftPlan.minPerDay, { count: r.min })}`;
  });
  return fill(copy.shiftPlan.minSummary, { text: parts.join(", ") });
}

/** "Пн–Пт", "Сб, Вс". */
function daysText(days: number[], names: string[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `${names[sorted[0] - 1]}–${names[sorted[sorted.length - 1] - 1]}`;
  return sorted.map((d) => names[d - 1]).join(", ");
}

/** Minimum staffing rules of one role (in the role dialog). */
export function StaffingRulesEditor({
  rules,
  onChange,
  disabled,
  copy,
  locale,
}: {
  rules: StaffingRule[];
  onChange: (rules: StaffingRule[]) => void;
  disabled: boolean;
  copy: CabinetCopy;
  locale: Locale;
}) {
  const p = copy.shiftPlan;
  const names = weekdayNames(locale);
  const fullNames = ALL_WEEKDAYS.map((d) => formatDate(addDays("2026-11-30", d - 1), locale, { weekday: "long" }));
  const update = (id: string, patch: Partial<StaffingRule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <fieldset className="staffing-editor" disabled={disabled}>
      <legend>{p.minTitle}</legend>
      <p className="staffing-hint">{disabled ? p.minNotInSchedule : p.minHint}</p>
      {!disabled &&
        rules.map((rule, index) => {
          const windowed = rule.from !== undefined;
          return (
            <div key={rule.id} className="staffing-rule" role="group" aria-label={`${p.minTitle} ${index + 1}`}>
              <div className="staffing-days" role="group" aria-label={p.minDaysAria}>
                {names.map((label, i) => {
                  const day = i + 1;
                  const on = rule.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      aria-label={fullNames[i]}
                      className={on ? "active" : ""}
                      onClick={() => {
                        const days = on ? rule.days.filter((d) => d !== day) : [...rule.days, day].sort((a, b) => a - b);
                        if (days.length) update(rule.id, { days });
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="staffing-row">
                <div className="staffing-mode" role="group">
                  <button
                    type="button"
                    aria-pressed={!windowed}
                    className={!windowed ? "active" : ""}
                    onClick={() => update(rule.id, { from: undefined, to: undefined })}
                  >
                    {p.minWholeDay}
                  </button>
                  <button
                    type="button"
                    aria-pressed={windowed}
                    className={windowed ? "active" : ""}
                    onClick={() => update(rule.id, { from: rule.from ?? "18:00", to: rule.to ?? "23:00" })}
                  >
                    {p.minWindow}
                  </button>
                </div>
                {windowed && (
                  <span className="staffing-times">
                    <input
                      type="time"
                      aria-label={copy.opsScheduleTimeStart}
                      value={rule.from}
                      onChange={(e) => update(rule.id, { from: e.target.value })}
                      className="cabinet-shift-input"
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      type="time"
                      aria-label={copy.opsScheduleTimeEnd}
                      value={rule.to}
                      onChange={(e) => update(rule.id, { to: e.target.value })}
                      className="cabinet-shift-input"
                    />
                  </span>
                )}
                <span className="staffing-stepper">
                  <span className="staffing-stepper-label">{p.minPeople}</span>
                  <button type="button" aria-label={p.minDecrease} disabled={rule.min <= 1} onClick={() => update(rule.id, { min: Math.max(1, rule.min - 1) })}>
                    −
                  </button>
                  <output aria-live="polite">{rule.min}</output>
                  <button type="button" aria-label={p.minIncrease} disabled={rule.min >= STAFFING_MAX} onClick={() => update(rule.id, { min: Math.min(STAFFING_MAX, rule.min + 1) })}>
                    +
                  </button>
                </span>
                <button type="button" className="staffing-remove" aria-label={p.minRemove} title={p.minRemove} onClick={() => onChange(rules.filter((r) => r.id !== rule.id))}>
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      {!disabled && rules.length < MAX_RULES_PER_ROLE && (
        <button type="button" className="panel-btn ghost sm staffing-add" onClick={() => onChange([...rules, defaultRule()])}>
          {p.minAdd}
        </button>
      )}
      {!disabled && rules.length > 0 && <small className="staffing-local">{p.minLocalNote}</small>}
    </fieldset>
  );
}
