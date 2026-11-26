"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { RoleBadge } from "@/components/cabinet-roles";
import type { StaffMember, WorkShift } from "@/lib/api";
import {
  checkShift,
  formatTime,
  occupiesTime,
  planShifts,
  roleDayCoverage,
  shiftMinutes,
  shiftSpan,
  totalsByStaff,
  WEEK_LIMIT_MINUTES,
  weekStart,
  addDays,
  type ScheduleContext,
  type ShiftDraft,
  type ShiftIssue,
  type ShiftLike,
  type StaffingByRole,
} from "@/lib/shift-schedule";
import type { RoleGroup } from "@/lib/venue-roles";
import {
  dayLabel,
  fill,
  formatDuration,
  formatHours,
  IssueList,
  issueText,
  LengthNote,
  ShiftDialog,
  ShiftHours,
  type CabinetCopy,
  type Locale,
} from "@/components/shift-ui";

export type Interval = { start: string; end: string };

const PRESETS: { key: "morning" | "day" | "evening" | "m4" | "e4"; start: string; end: string }[] = [
  { key: "morning", start: "08:00", end: "16:00" },
  { key: "day", start: "10:00", end: "22:00" },
  { key: "evening", start: "14:00", end: "23:00" },
  { key: "m4", start: "08:00", end: "12:00" },
  { key: "e4", start: "18:00", end: "22:00" },
];

export const memberName = (m: Pick<StaffMember, "name" | "email">) => m.name?.trim() || m.email.split("@")[0];

/** Start/end fields with presets and an optional second interval (split shift). */
export function IntervalFields({
  idPrefix,
  date,
  first,
  second,
  onFirst,
  onSecond,
  allowSplit = true,
  copy,
}: {
  idPrefix: string;
  date: string;
  first: Interval;
  second: Interval | null;
  onFirst: (v: Interval) => void;
  onSecond: (v: Interval | null) => void;
  allowSplit?: boolean;
  copy: CabinetCopy;
}) {
  const p = copy.shiftPlan;
  const labels = {
    morning: copy.opsSchedulePresetMorning,
    day: copy.opsSchedulePresetDay,
    evening: copy.opsSchedulePresetEvening,
    m4: p.preset4Morning,
    e4: p.preset4Evening,
  };
  const total = second ? shiftMinutes({ date, start_time: first.start, end_time: first.end }) + shiftMinutes({ date, start_time: second.start, end_time: second.end }) : 0;
  return (
    <>
      <div className="cabinet-shift-field-group">
        <span className="shift-field-label">{copy.opsSchedulePresetsTitle}</span>
        <div className="cabinet-shift-preset-buttons">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`chip cabinet-shift-preset-pill${!second && first.start === preset.start && first.end === preset.end ? " is-active" : ""}`}
              onClick={() => {
                onFirst({ start: preset.start, end: preset.end });
                onSecond(null);
              }}
            >
              {labels[preset.key]}
            </button>
          ))}
          {allowSplit && (
            <button
              type="button"
              className={`chip cabinet-shift-preset-pill${second ? " is-active" : ""}`}
              onClick={() => {
                onFirst({ start: "08:00", end: "12:00" });
                onSecond({ start: "18:00", end: "22:00" });
              }}
            >
              {p.presetSplit}
            </button>
          )}
        </div>
      </div>

      <div className="cabinet-shift-time-row">
        <div className="cabinet-shift-field-group">
          <label htmlFor={`${idPrefix}-start`}>{copy.opsScheduleTimeStart}</label>
          <input
            id={`${idPrefix}-start`}
            type="time"
            required
            value={first.start}
            onChange={(e) => onFirst({ ...first, start: e.target.value })}
            className="cabinet-shift-input"
          />
        </div>
        <div className="cabinet-shift-field-group">
          <label htmlFor={`${idPrefix}-end`}>{copy.opsScheduleTimeEnd}</label>
          <input
            id={`${idPrefix}-end`}
            type="time"
            required
            value={first.end}
            onChange={(e) => onFirst({ ...first, end: e.target.value })}
            className="cabinet-shift-input"
          />
        </div>
      </div>
      <LengthNote date={date} start={first.start} end={first.end} copy={p} />

      {allowSplit && (
        <label className="cabinet-shift-split-toggle">
          <input
            type="checkbox"
            checked={Boolean(second)}
            onChange={(e) => onSecond(e.target.checked ? { start: "18:00", end: "22:00" } : null)}
          />
          <span>{p.splitToggle}</span>
        </label>
      )}

      {second && (
        <div className="cabinet-shift-split-box">
          <div className="cabinet-shift-time-row">
            <div className="cabinet-shift-field-group">
              <label htmlFor={`${idPrefix}-split-start`}>{p.interval2Start}</label>
              <input
                id={`${idPrefix}-split-start`}
                type="time"
                required
                value={second.start}
                onChange={(e) => onSecond({ ...second, start: e.target.value })}
                className="cabinet-shift-input"
              />
            </div>
            <div className="cabinet-shift-field-group">
              <label htmlFor={`${idPrefix}-split-end`}>{p.interval2End}</label>
              <input
                id={`${idPrefix}-split-end`}
                type="time"
                required
                value={second.end}
                onChange={(e) => onSecond({ ...second, end: e.target.value })}
                className="cabinet-shift-input"
              />
            </div>
          </div>
          <LengthNote date={date} start={second.start} end={second.end} copy={p} />
          {total > 0 && <span className="cabinet-shift-duration-summary">{fill(p.dayTotal, { total: formatDuration(total, p) })}</span>}
        </div>
      )}
    </>
  );
}

/** Checks drafts one after another (so split parts are checked against each other). */
export function checkDrafts(drafts: ShiftDraft[], shifts: readonly ShiftLike[], ctx: ScheduleContext) {
  const pool: ShiftLike[] = [...shifts];
  const blocking: ShiftIssue[] = [];
  const warnings: ShiftIssue[] = [];
  for (const d of drafts) {
    const r = checkShift(d, pool, ctx);
    blocking.push(...r.blocking);
    warnings.push(...r.warnings);
    pool.push({ ...d, status: "PENDING" });
  }
  return { blocking, warnings };
}

/** Extra warning lines for a person: week over 40 h, invite not accepted. */
export function personWarnings(
  member: StaffMember | undefined,
  staffId: string,
  drafts: ShiftDraft[],
  shifts: readonly ShiftLike[],
  ctx: ScheduleContext,
  copy: CabinetCopy,
  locale: Locale,
): string[] {
  const out: string[] = [];
  const p = copy.shiftPlan;
  if (member && member.status !== "ACTIVE") out.push(p.issueInvited);
  const weeks = new Set(drafts.map((d) => weekStart(d.date)));
  for (const ws of weeks) {
    const pool = [...shifts.filter((s) => !(s.id && ctx.ignoreIds?.has(s.id))), ...drafts.map((d) => ({ ...d, status: "PENDING" as const }))];
    const total = totalsByStaff(pool, ws, addDays(ws, 6), ctx.tz).get(staffId)?.minutes ?? 0;
    if (total > WEEK_LIMIT_MINUTES) out.push(fill(p.issueWeek, { hours: formatHours(total, p, locale) }));
  }
  return out;
}

export type QuickMode = { kind: "create"; member: StaffMember; date: string } | { kind: "edit"; shift: WorkShift; member?: StaffMember };

/** Assign one person a shift (optionally split), or change the time of a saved shift. */
export function QuickShiftDialog({
  mode,
  shifts,
  ctx,
  today,
  locale,
  copy,
  roleName,
  busy,
  onClose,
  onSubmit,
}: {
  mode: QuickMode;
  shifts: WorkShift[];
  ctx: ScheduleContext;
  today: string;
  locale: Locale;
  copy: CabinetCopy;
  roleName: (key: string) => string;
  busy: boolean;
  onClose: () => void;
  /** Creates drafts after deleting `removeIds` (the edited shift and/or replaced ones). */
  onSubmit: (drafts: ShiftDraft[], removeIds: string[], kind: "create" | "edit" | "replace") => Promise<boolean>;
}) {
  const p = copy.shiftPlan;
  const editing = mode.kind === "edit" ? mode.shift : null;
  const staffId = editing ? editing.staff_id : mode.kind === "create" ? mode.member.id : "";
  const member = mode.member;
  const [date, setDate] = useState(editing ? editing.date : mode.kind === "create" ? mode.date : today);
  const [first, setFirst] = useState<Interval>(() => {
    if (editing) return { start: editing.start_time, end: editing.end_time };
    return suggestSlot(shifts, staffId, mode.kind === "create" ? mode.date : today);
  });
  const [second, setSecond] = useState<Interval | null>(null);
  const [note, setNote] = useState(editing?.note ?? "");

  const role = editing?.role ?? member?.role ?? "";
  const drafts: ShiftDraft[] = useMemo(() => {
    const base = { staff_id: staffId, date, role, ...(note.trim() ? { note: note.trim() } : {}) };
    const list = [{ ...base, start_time: first.start, end_time: first.end }];
    if (second) list.push({ ...base, start_time: second.start, end_time: second.end });
    return list;
  }, [staffId, date, role, note, first, second]);

  const ignore = useMemo(() => new Set(editing ? [editing.id] : []), [editing]);
  const checkCtx = useMemo(() => ({ ...ctx, ignoreIds: ignore }), [ctx, ignore]);
  const result = useMemo(() => checkDrafts(drafts, shifts, checkCtx), [drafts, shifts, checkCtx]);
  // Saved shifts in the way that could be replaced (not over yet).
  const replaceable = result.blocking.flatMap((i) => (i.code === "overlap" || i.code === "duplicate" ? [i.shift] : []));
  const replaceKey = [...new Set(replaceable.map((s) => s.id).filter((id): id is string => Boolean(id)))].join(",");
  const replaceIds = replaceKey ? replaceKey.split(",") : [];
  const onlyConflicts = result.blocking.length > 0 && result.blocking.every((i) => i.code === "overlap" || i.code === "duplicate");
  const replaceCtx = useMemo(
    () => ({ ...ctx, ignoreIds: new Set([...ignore, ...(replaceKey ? replaceKey.split(",") : [])]) }),
    [ctx, ignore, replaceKey],
  );
  const afterReplace = useMemo(() => checkDrafts(drafts, shifts, replaceCtx), [drafts, shifts, replaceCtx]);
  const canReplace =
    onlyConflicts &&
    replaceIds.length > 0 &&
    afterReplace.blocking.length === 0 &&
    replaceable.every((s) => (ctx.now ? (shiftEnd(s) ?? 0) > ctx.now.getTime() : true));
  const extra = personWarnings(member, staffId, drafts, shifts, checkCtx, copy, locale);

  const dayShifts = shifts
    .filter((s) => s.staff_id === staffId && s.date === date && occupiesTime(s) && !ignore.has(s.id))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const name = member ? memberName(member) : editing?.staff_name ?? "";
  const unchanged = editing && editing.date === date && editing.start_time === first.start && editing.end_time === first.end && (editing.note ?? "") === note.trim();

  return (
    <ShiftDialog
      open
      onClose={onClose}
      title={editing ? p.editTitle : p.quickTitle}
      sub={`${name} · ${roleName(role)}`}
      closeLabel={copy.opsMenuCancel}
    >
      <form
        className="cabinet-shift-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (result.blocking.length || busy) return;
          void onSubmit(drafts, editing ? [editing.id] : [], editing ? "edit" : "create");
        }}
      >
        {editing && <p className="shift-dialog-hint">{p.editHint}</p>}
        <div className="cabinet-shift-field-group">
          <label htmlFor="quick-date">{copy.opsScheduleDateLabel}</label>
          <input id="quick-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="cabinet-shift-input" />
        </div>

        {dayShifts.length > 0 && (
          <div className="cabinet-existing-shifts-note">
            <strong>{p.alreadyThatDay}</strong>{" "}
            {dayShifts.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <ShiftHours start={s.start_time} end={s.end_time} />
              </span>
            ))}
          </div>
        )}

        <IntervalFields
          idPrefix="quick"
          date={date}
          first={first}
          second={second}
          onFirst={setFirst}
          onSecond={setSecond}
          allowSplit={!editing}
          copy={copy}
        />

        <IssueList
          blocking={result.blocking}
          warnings={result.warnings}
          extra={extra}
          today={today}
          locale={locale}
          copy={copy}
          action={
            canReplace ? (
              <div className="shift-replace-row">
                <p>{p.replaceHint}</p>
                <button
                  type="button"
                  className="btn btn--danger-outline btn--sm"
                  disabled={busy}
                  onClick={() => void onSubmit(drafts, [...(editing ? [editing.id] : []), ...replaceIds], "replace")}
                >
                  {p.replaceBtn}
                </button>
              </div>
            ) : null
          }
        />

        <div className="cabinet-shift-field-group">
          <label htmlFor="quick-note">{copy.opsScheduleNoteLabel}</label>
          <input
            id="quick-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.opsScheduleNotePlaceholder}
            className="cabinet-shift-input"
          />
        </div>

        <div className="cabinet-shift-actions">
          <button type="submit" className="btn btn--primary btn--md" disabled={busy || result.blocking.length > 0 || Boolean(unchanged)}>
            {editing ? p.save : copy.opsScheduleSubmitBtn}
          </button>
          <button type="button" className="btn btn--ghost btn--md" disabled={busy} onClick={onClose}>
            {copy.opsMenuCancel}
          </button>
        </div>
      </form>
    </ShiftDialog>
  );
}

const shiftEnd = (s: ShiftLike) => shiftSpan(s)?.end;

/** A free default slot for another shift that day (full day when free, else a 4 h part). */
export function suggestSlot(shifts: readonly ShiftLike[], staffId: string, date: string): Interval {
  const busy = shifts.filter((s) => s.staff_id === staffId && s.date === date && occupiesTime(s));
  if (!busy.length) return { start: "10:00", end: "22:00" };
  const candidates = [
    { start: "08:00", end: "12:00" },
    { start: "12:00", end: "16:00" },
    { start: "18:00", end: "22:00" },
    { start: "14:00", end: "18:00" },
  ];
  const free = candidates.find((c) => checkShift({ staff_id: staffId, date, start_time: c.start, end_time: c.end }, busy).blocking.length === 0);
  return free ?? { start: "18:00", end: "22:00" };
}

/** Assign many people the same hours on one date. */
export function BatchAssignDialog({
  initialDate,
  groups,
  groupTitle,
  shifts,
  staffing,
  ctx,
  today,
  locale,
  copy,
  busy,
  onClose,
  onSubmit,
}: {
  initialDate: string;
  groups: RoleGroup[];
  groupTitle: (g: RoleGroup) => string;
  shifts: WorkShift[];
  staffing: StaffingByRole;
  ctx: ScheduleContext;
  today: string;
  locale: Locale;
  copy: CabinetCopy;
  busy: boolean;
  onClose: () => void;
  onSubmit: (drafts: ShiftDraft[]) => Promise<boolean>;
}) {
  const p = copy.shiftPlan;
  const [date, setDate] = useState(initialDate);
  const [first, setFirst] = useState<Interval>({ start: "10:00", end: "22:00" });
  const [second, setSecond] = useState<Interval | null>(null);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const draftsFor = (m: StaffMember): ShiftDraft[] => {
    const base = { staff_id: m.id, date, role: m.role, ...(note.trim() ? { note: note.trim() } : {}) };
    return [{ ...base, start_time: first.start, end_time: first.end }, ...(second ? [{ ...base, start_time: second.start, end_time: second.end }] : [])];
  };
  const checks = new Map(
    groups.flatMap((g) => g.members).map((m) => {
      const drafts = draftsFor(m);
      const r = checkDrafts(drafts, shifts, ctx);
      return [m.id, { ...r, extra: personWarnings(m, m.id, drafts, shifts, ctx, copy, locale) }] as const;
    }),
  );
  const pickable = (id: string) => (checks.get(id)?.blocking.length ?? 1) === 0;
  const chosen = groups.flatMap((g) => g.members).filter((m) => selected.includes(m.id) && pickable(m.id));
  const plan = planShifts(chosen.flatMap(draftsFor), shifts, ctx);
  const plannedIds = new Set(plan.accepted.map((a) => a.draft.staff_id));
  const after = [...shifts, ...plan.accepted.map((a) => ({ ...a.draft, status: "PENDING" as const, id: undefined }))];

  return (
    <ShiftDialog
      open
      onClose={onClose}
      size="wide"
      title={copy.plannerBatchModalTitle.replace("{date}", dayLabel(date, today, locale, copy))}
      sub={p.batchSub}
      closeLabel={copy.opsMenuCancel}
    >
      <form
        className="cabinet-shift-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!plan.accepted.length || busy) return;
          void onSubmit(plan.accepted.map((a) => a.draft));
        }}
      >
        <div className="cabinet-shift-field-group">
          <label htmlFor="batch-date">{copy.opsScheduleDateLabel}</label>
          <input id="batch-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="cabinet-shift-input" />
        </div>

        <IntervalFields idPrefix="batch" date={date} first={first} second={second} onFirst={setFirst} onSecond={setSecond} copy={copy} />

        <div className="cabinet-shift-roles-split">
          {groups.length === 0 && <p className="fa-muted">{copy.roles.plannerEmptyRoles}</p>}
          {groups.map((group) => {
            const ids = group.members.map((m) => m.id);
            const here = ids.filter((id) => plannedIds.has(id)).length;
            return (
              <div key={group.role.key} className="cabinet-shift-field-group">
                <div className="cabinet-shift-staff-header">
                  <span className="shift-field-label">
                    <RoleBadge label={groupTitle(group)} color={group.role.color} /> ({here})
                  </span>
                  <div className="cabinet-shift-staff-bulk-actions">
                    <button
                      type="button"
                      className="btn btn--link cabinet-shift-bulk-btn"
                      onClick={() => setSelected((prev) => [...new Set([...prev, ...ids.filter(pickable)])])}
                    >
                      {copy.opsScheduleSelectAll}
                    </button>
                    <button type="button" className="btn btn--link cabinet-shift-bulk-btn" onClick={() => setSelected((prev) => prev.filter((id) => !ids.includes(id)))}>
                      {copy.opsScheduleDeselectAll}
                    </button>
                  </div>
                </div>
                <div className="cabinet-shift-staff-grid">
                  {group.members.map((m) => {
                    const check = checks.get(m.id)!;
                    const blocked = check.blocking.length > 0;
                    const isSelected = !blocked && selected.includes(m.id);
                    const name = memberName(m);
                    const firstBlock = check.blocking[0];
                    const existing = shifts
                      .filter((s) => s.staff_id === m.id && s.date === date && occupiesTime(s))
                      .sort((a, b) => a.start_time.localeCompare(b.start_time));
                    const blockText = firstBlock ? issueText(firstBlock, today, locale, copy) : "";
                    const warnText = [...check.warnings.map((w) => issueText(w, today, locale, copy)), ...check.extra][0];
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={blocked}
                        title={blocked ? blockText : warnText}
                        className={`cabinet-shift-staff-pill ${isSelected ? "selected" : ""} ${blocked ? "conflict" : warnText ? "warn" : ""}`}
                        onClick={() => setSelected((prev) => (isSelected ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}
                      >
                        <span className="cabinet-shift-checkbox" aria-hidden="true">
                          {blocked ? "!" : isSelected ? "✓" : ""}
                        </span>
                        <span className="cabinet-staff-avatar xs" aria-hidden="true">
                          {name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="cabinet-shift-staff-pill-meta">
                          <span className="cabinet-shift-staff-pill-name">{name}</span>
                          {blocked ? (
                            <small className="cabinet-shift-pill-conflict">{blockText}</small>
                          ) : warnText ? (
                            <small className="cabinet-shift-pill-warn">⚠ {warnText}</small>
                          ) : existing.length > 0 ? (
                            <small className="cabinet-shift-pill-existing">
                              {existing.map((s, i) => (
                                <span key={s.id}>
                                  {i > 0 && ", "}
                                  <ShiftHours start={s.start_time} end={s.end_time} />
                                </span>
                              ))}
                            </small>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {groups.some((g) => (staffing[g.role.key] ?? []).length > 0) && (
          <div className="shift-coverage-after">
            <span>{p.coverageAfter}</span>
            {groups.map((g) => {
              const cov = roleDayCoverage(after, date, g.role.key, staffing[g.role.key]);
              if (!cov.rules.length) return null;
              return (
                <span key={g.role.key} className={`cabinet-coverage-chip ${cov.short ? "short" : "ok"}`} style={{ "--role-color": g.role.color } as CSSProperties}>
                  <i aria-hidden="true" />
                  {groupTitle(g)} {cov.need ? `${cov.people}/${cov.need}` : cov.people}
                  {cov.rules
                    .filter((r) => r.rule.from && r.short)
                    .map((r) => (
                      <small key={r.rule.id}>
                        {" "}
                        · {formatTime(r.gaps[0]?.from ?? 0)}–{formatTime(r.gaps[0]?.to ?? 0)} {r.have}/{r.need}
                      </small>
                    ))}
                </span>
              );
            })}
          </div>
        )}

        <div className="cabinet-shift-field-group">
          <label htmlFor="batch-note">{copy.opsScheduleNoteLabel}</label>
          <input
            id="batch-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.opsScheduleNotePlaceholder}
            className="cabinet-shift-input"
          />
        </div>

        <div className="cabinet-shift-actions">
          <button type="submit" className="btn btn--primary btn--md" disabled={busy || plan.accepted.length === 0}>
            {fill(p.assignCount, { count: plan.accepted.length })}
          </button>
          <button type="button" className="btn btn--ghost btn--md" disabled={busy} onClick={onClose}>
            {copy.opsMenuCancel}
          </button>
        </div>
      </form>
    </ShiftDialog>
  );
}
