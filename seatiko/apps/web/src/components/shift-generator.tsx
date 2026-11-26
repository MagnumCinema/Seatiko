"use client";

import { useMemo, useState } from "react";
import { RoleBadge } from "@/components/cabinet-roles";
import { SelectMenu } from "@/components/ui/select-menu";
import { IntervalFields, memberName, type Interval } from "@/components/shift-dialogs";
import {
  fill,
  formatDate,
  plural,
  ShiftDialog,
  weekdayNames,
  type CabinetCopy,
  type Locale,
} from "@/components/shift-ui";
import type { WorkShift } from "@/lib/api";
import {
  addDays,
  addMonths,
  formatTime,
  generatePattern,
  occupiesTime,
  shiftSpan,
  shortDaysByRole,
  type Pattern,
  type ScheduleContext,
  type ShiftDraft,
  type StaffingByRole,
  type TeamMode,
} from "@/lib/shift-schedule";
import type { RoleGroup } from "@/lib/venue-roles";

type Kind = "2/2" | "3/3" | "weekdays";
type Period = "1w" | "2w" | "4w" | "month";

export function periodEnd(from: string, period: Period): string {
  if (period === "month") return addDays(addMonths(from, 1), -1);
  return addDays(from, period === "1w" ? 6 : period === "2w" ? 13 : 27);
}

/** "12, 13, 19 дек." — short list of dates. */
function datesText(dates: string[], locale: Locale): string {
  const shown = dates.slice(0, 6).map((d) => formatDate(d, locale, { day: "numeric", month: "short" }));
  return dates.length > 6 ? `${shown.join(", ")}…` : shown.join(", ");
}

/** Stable schedule generator: 2/2, 3/3 or weekdays, anchored, checked, filled to minimums. */
export function GeneratorDialog({
  initialFrom,
  groups,
  groupTitle,
  roleName,
  shifts,
  staffing,
  ctx,
  locale,
  copy,
  busy,
  onClose,
  onSubmit,
}: {
  initialFrom: string;
  groups: RoleGroup[];
  groupTitle: (g: RoleGroup) => string;
  roleName: (key: string) => string;
  shifts: WorkShift[];
  staffing: StaffingByRole;
  ctx: ScheduleContext;
  locale: Locale;
  copy: CabinetCopy;
  busy: boolean;
  onClose: () => void;
  onSubmit: (drafts: ShiftDraft[], removeIds: string[]) => Promise<boolean>;
}) {
  const p = copy.shiftPlan;
  const [kind, setKind] = useState<Kind>("2/2");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [teamMode, setTeamMode] = useState<TeamMode>("alternate");
  const [from, setFrom] = useState(initialFrom);
  const [period, setPeriod] = useState<Period>("2w");
  const [anchor, setAnchor] = useState(initialFrom);
  const [anchorTouched, setAnchorTouched] = useState(false);
  const [continueRhythm, setContinueRhythm] = useState(true);
  const [fillMin, setFillMin] = useState(true);
  const [replace, setReplace] = useState(false);
  const [first, setFirst] = useState<Interval>({ start: "10:00", end: "22:00" });
  const [second, setSecond] = useState<Interval | null>(null);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const to = periodEnd(from, period);
  const pattern: Pattern = useMemo(
    () => (kind === "weekdays" ? { kind: "weekdays", days: weekdays } : kind === "3/3" ? { kind: "cycle", on: 3, off: 3 } : { kind: "cycle", on: 2, off: 2 }),
    [kind, weekdays],
  );
  const members = useMemo(
    () => groups.flatMap((g) => g.members.filter((m) => selected.includes(m.id)).map((m) => ({ id: m.id, role: m.role }))),
    [groups, selected],
  );
  const selectedRoles = [...new Set(members.map((m) => m.role))];
  const hasMinimums = selectedRoles.some((r) => (staffing[r] ?? []).length > 0);
  const now = ctx.now?.getTime() ?? 0;

  const toDelete = useMemo(() => {
    if (!replace) return [];
    const ids = new Set(selected);
    return shifts.filter((s) => ids.has(s.staff_id) && occupiesTime(s) && s.date >= from && s.date <= to && (shiftSpan(s)?.end ?? 0) > now);
  }, [replace, selected, shifts, from, to, now]);

  const result = useMemo(() => {
    if (!members.length || (pattern.kind === "weekdays" && !pattern.days.length)) return null;
    const removed = new Set(toDelete.map((s) => s.id));
    return generatePattern({
      pattern,
      anchor: kind === "weekdays" ? from : anchor,
      from,
      to,
      intervals: [first, ...(second ? [second] : [])],
      members,
      teamMode,
      continueRhythm,
      fillToMinimum: fillMin && hasMinimums,
      staffing,
      existing: shifts.filter((s) => !removed.has(s.id)),
      ctx,
    });
  }, [pattern, kind, anchor, from, to, first, second, members, teamMode, continueRhythm, fillMin, hasMinimums, staffing, shifts, ctx, toDelete]);

  const skippedBy = (codes: string[]) => result?.skipped.filter((s) => codes.includes(s.reason.code)).length ?? 0;
  const skipParts = [
    [p.skipOverlap, skippedBy(["overlap"])],
    [p.skipDuplicate, skippedBy(["duplicate"])],
    [p.skipRest, skippedBy(["short_rest"])],
    [p.skipEnded, skippedBy(["ended"])],
    [p.skipDays, skippedBy(["too_many_days"])],
    [p.skipInvalid, skippedBy(["invalid_time", "zero_length"])],
  ].filter(([, n]) => (n as number) > 0) as [string, number][];
  const shortByRole = result ? shortDaysByRole(result.shortages) : new Map<string, string[]>();
  const names = weekdayNames(locale);
  const cycleOn = kind === "3/3" ? 3 : 2;
  const confirmedToDelete = toDelete.filter((s) => s.status === "CONFIRMED").length;

  return (
    <ShiftDialog open onClose={onClose} size="wide" title={copy.plannerRecurringModalTitle} sub={p.genSub} closeLabel={copy.opsMenuCancel}>
      <form
        className="cabinet-shift-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!result || busy || (!result.accepted.length && !toDelete.length)) return;
          // The note does not change planning, so it is added only now (typing it does not re-plan).
          const text = note.trim();
          void onSubmit(
            result.accepted.map((a) => (text ? { ...a.draft, note: text } : a.draft)),
            toDelete.map((s) => s.id),
          );
        }}
      >
        <div className="cabinet-shift-field-group">
          <span className="shift-field-label">{copy.plannerRecurringPattern}</span>
          <div className="cabinet-shift-role-toggle shift-segmented" role="group">
            {(
              [
                ["2/2", p.pattern22],
                ["3/3", p.pattern33],
                ["weekdays", p.patternWeekdays],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                className={`cabinet-shift-role-btn ${kind === value ? "active" : ""}`}
                onClick={() => setKind(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {kind === "weekdays" ? (
          <div className="cabinet-shift-field-group">
            <span className="shift-field-label">{p.workDays}</span>
            <div className="cabinet-planner-weekday-pills" role="group" aria-label={p.workDays}>
              {names.map((label, i) => {
                const day = i + 1;
                const on = weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    className={`cabinet-planner-weekday-pill ${on ? "active" : ""}`}
                    onClick={() => setWeekdays((prev) => (on ? prev.filter((d) => d !== day) : [...prev, day].sort()))}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="cabinet-shift-field-group">
            <span className="shift-field-label">{p.teamsLabel}</span>
            <div className="cabinet-wave-selector">
              {(
                [
                  ["alternate", p.teamAlt, p.teamAltHint],
                  ["team_a", p.teamA, p.teamAHint],
                  ["team_b", p.teamB, fill(p.teamBHint, { n: cycleOn })],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={teamMode === value}
                  className={`cabinet-wave-btn ${teamMode === value ? "active" : ""}`}
                  onClick={() => setTeamMode(value)}
                >
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cabinet-shift-time-row">
          <div className="cabinet-shift-field-group">
            <label htmlFor="gen-from">{p.fromLabel}</label>
            <input
              id="gen-from"
              type="date"
              required
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (!anchorTouched) setAnchor(e.target.value);
              }}
              className="cabinet-shift-input"
            />
          </div>
          <div className="cabinet-shift-field-group">
            <label htmlFor="gen-period">{p.periodLabel}</label>
            <SelectMenu
              id="gen-period"
              value={period}
              onChange={(v) => setPeriod(v as Period)}
              options={[
                { value: "1w", label: p.period1w },
                { value: "2w", label: p.period2w },
                { value: "4w", label: p.period4w },
                { value: "month", label: p.periodMonth },
              ]}
            />
          </div>
        </div>
        <p className="shift-dialog-hint">
          {formatDate(from, locale, { day: "numeric", month: "short" })} – {formatDate(to, locale, { day: "numeric", month: "short", year: "numeric" })}
        </p>

        {kind !== "weekdays" && (
          <div className="cabinet-shift-field-group">
            <label htmlFor="gen-anchor">{p.anchorLabel}</label>
            <input
              id="gen-anchor"
              type="date"
              required
              value={anchor}
              onChange={(e) => {
                setAnchor(e.target.value);
                setAnchorTouched(true);
              }}
              className="cabinet-shift-input"
            />
            <small className="shift-field-hint">{p.anchorHint}</small>
          </div>
        )}

        <IntervalFields idPrefix="gen" date={from} first={first} second={second} onFirst={setFirst} onSecond={setSecond} copy={copy} />

        <div className="shift-checks">
          {kind !== "weekdays" && (
            <label className="cabinet-shift-split-toggle">
              <input type="checkbox" checked={continueRhythm} onChange={(e) => setContinueRhythm(e.target.checked)} />
              <span>{p.continueRhythm}</span>
            </label>
          )}
          <label className={`cabinet-shift-split-toggle ${hasMinimums ? "" : "muted"}`}>
            <input type="checkbox" checked={fillMin && hasMinimums} disabled={!hasMinimums} onChange={(e) => setFillMin(e.target.checked)} />
            <span>
              {p.fillMin}
              <small>{hasMinimums ? p.fillMinHint : p.noMinShort}</small>
            </span>
          </label>
          <label className="cabinet-shift-split-toggle">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            <span>{p.replaceExisting}</span>
          </label>
        </div>

        <div className="cabinet-shift-roles-split">
          {groups.length === 0 && <p className="fa-muted">{copy.roles.plannerEmptyRoles}</p>}
          {groups.map((group) => {
            const ids = group.members.map((m) => m.id);
            const here = ids.filter((id) => selected.includes(id)).length;
            return (
              <div key={group.role.key} className="cabinet-shift-field-group">
                <div className="cabinet-shift-staff-header">
                  <span className="shift-field-label">
                    <RoleBadge label={groupTitle(group)} color={group.role.color} /> ({here})
                  </span>
                  <div className="cabinet-shift-staff-bulk-actions">
                    <button type="button" className="cabinet-shift-bulk-btn" onClick={() => setSelected((prev) => [...new Set([...prev, ...ids])])}>
                      {copy.opsScheduleSelectAll}
                    </button>
                    <button type="button" className="cabinet-shift-bulk-btn" onClick={() => setSelected((prev) => prev.filter((id) => !ids.includes(id)))}>
                      {copy.opsScheduleDeselectAll}
                    </button>
                  </div>
                </div>
                <div className="cabinet-shift-staff-grid">
                  {group.members.map((m) => {
                    const on = selected.includes(m.id);
                    const name = memberName(m);
                    const phase = result?.phases.get(m.id);
                    const tag = !on || !phase ? null : phase.source === "rhythm" ? p.rhythmTag : phase.source === "team_b" ? p.teamTagB : p.teamTagA;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        className={`cabinet-shift-staff-pill ${on ? "selected" : ""}`}
                        onClick={() => setSelected((prev) => (on ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}
                      >
                        <span className="cabinet-shift-checkbox" aria-hidden="true">
                          {on ? "✓" : ""}
                        </span>
                        <span className="cabinet-staff-avatar xs" aria-hidden="true">
                          {name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="cabinet-shift-staff-pill-name">{name}</span>
                        {tag && kind !== "weekdays" && (
                          <span className={`cabinet-wave-chip ${phase?.source === "team_b" ? "wave-b" : phase?.source === "rhythm" ? "wave-r" : "wave-a"}`}>{tag}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="cabinet-shift-field-group">
          <label htmlFor="gen-note">{copy.opsScheduleNoteLabel}</label>
          <input
            id="gen-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.opsScheduleNotePlaceholder}
            className="cabinet-shift-input"
          />
        </div>

        {result && (
          <div className="shift-gen-preview" aria-live="polite">
            <p>
              <strong>{fill(p.previewCreate, { count: result.accepted.length })}</strong>
              {result.filled > 0 && <> · {fill(p.previewFilled, { count: result.filled })}</>}
            </p>
            {toDelete.length > 0 && <p className="danger">{fill(p.willDelete, { count: toDelete.length, confirmed: confirmedToDelete })}</p>}
            {skipParts.length > 0 && (
              <p className="muted">
                {fill(p.previewSkipped, { count: result.skipped.length })}: {skipParts.map(([label, n]) => fill(label, { count: n })).join(", ")}
              </p>
            )}
            {hasMinimums &&
              (shortByRole.size > 0 ? (
                <div className="shift-gen-short">
                  <strong>{p.previewShort}</strong>
                  <ul>
                    {[...shortByRole].map(([role, days]) => {
                      const hours = [
                        ...new Set(
                          (result?.shortages ?? [])
                            .filter((s) => s.role === role)
                            .flatMap((s) => s.coverage.gaps.map((g) => `${formatTime(g.from)}–${formatTime(g.to)}`)),
                        ),
                      ];
                      return (
                        <li key={role}>
                          {roleName(role)} — {days.length} {plural(days.length, p.dayForms, locale)}: {datesText(days, locale)}
                          {hours.length > 0 && <> ({hours.slice(0, 3).join(", ")})</>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="ok">{p.previewCovered}</p>
              ))}
            <p className="muted small">{p.seriesNote}</p>
          </div>
        )}

        <div className="cabinet-shift-actions">
          <button type="submit" className="panel-btn primary" disabled={busy || !result || (!result.accepted.length && !toDelete.length)}>
            {fill(p.createCount, { count: result?.accepted.length ?? 0 })}
          </button>
          <button type="button" className="panel-btn ghost" disabled={busy} onClick={onClose}>
            {copy.opsMenuCancel}
          </button>
        </div>
      </form>
    </ShiftDialog>
  );
}
