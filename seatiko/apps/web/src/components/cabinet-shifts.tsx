"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocale } from "@/components/locale-provider";
import { RoleBadge } from "@/components/cabinet-roles";
import { BatchAssignDialog, memberName, QuickShiftDialog, type QuickMode } from "@/components/shift-dialogs";
import { GeneratorDialog } from "@/components/shift-generator";
import {
  dayLabel,
  fill,
  formatDate,
  formatDuration,
  formatHours,
  IssueList,
  issueText as issueLine,
  plural,
  ShiftDialog,
  ShiftHours,
  shiftWhen,
  statusIcon,
  statusLabel,
  type CabinetCopy,
  type Locale,
} from "@/components/shift-ui";
import {
  ApiError,
  batchCreateVenueWorkShifts,
  createVenueWorkShift,
  deleteVenueWorkShift,
  listVenueRoles,
  listVenueStaff,
  listVenueWorkShifts,
  swapVenueWorkShiftStaff,
  type StaffMember,
  type VenueRole,
  type WorkShift,
} from "@/lib/api";
import {
  addDays,
  checkShift,
  copyWeekDrafts,
  datesBetween,
  findShortages,
  formatTime,
  groupForBatch,
  hourlyHeadcount,
  isWindowRule,
  monthBounds,
  occupiesTime,
  parseHoursText,
  parseTime,
  personIndex,
  planShifts,
  roleDayCoverage,
  rulesForDate,
  scheduleProblems,
  shiftSpan,
  shortDaysByRole,
  todayInZone,
  totalsByStaff,
  VENUE_TIME_ZONE,
  WEEK_LIMIT_MINUTES,
  weekStart,
  type RoleDayCoverage,
  type ScheduleContext,
  type ShiftDraft,
  type StaffingByRole,
} from "@/lib/shift-schedule";
import { getSiteCopy } from "@/lib/site-copy";
import { readStaffing, STAFFING_EVENT } from "@/lib/staffing-store";
import { groupStaffByRole, plannerRoles, roleLabel, roleNameByKey, shiftRoleLabel, type RoleGroup } from "@/lib/venue-roles";
import "@/app/cabinet/shifts.css";

type Props = {
  venueId: string;
  /** Venue opening hours text ("Пн–Вс 10:00–23:00"): shifts far outside get a warning. */
  hoursText?: string;
  onAlertCountChange?: (count: number) => void;
};

type Dialog =
  | { kind: "batch"; date: string }
  | { kind: "quick"; mode: QuickMode }
  | { kind: "generator"; from: string }
  | { kind: "copy" }
  | { kind: "personal"; member: StaffMember }
  | { kind: "inspect"; shift: WorkShift }
  | { kind: "swap"; shift: WorkShift }
  | { kind: "delete"; shift: WorkShift };

type Notice = { type: "success" | "error"; text: string };
type Problems = ReturnType<typeof scheduleProblems>;

/** A server answer that some shifts were not created. */
class PartialError extends Error {}

export function CabinetShiftsPlanner({ venueId, hoursText, onAlertCountChange }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const p = copy.shiftPlan;
  const presetNames = copy.roles.presets as Record<string, string>;

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<VenueRole[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [staffing, setStaffing] = useState<StaffingByRole>({});
  const [now, setNow] = useState(() => new Date());
  const today = todayInZone(now);
  const [viewMode, setViewMode] = useState<"matrix" | "day">("matrix");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekFrom, setWeekFrom] = useState(() => weekStart(today));
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const matrixRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Minimum staffing lives in this browser for now (BACKEND_TASKS №31); follow edits from the roles card.
  useEffect(() => {
    const sync = () => setStaffing(readStaffing(venueId));
    queueMicrotask(sync);
    window.addEventListener(STAFFING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(STAFFING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [venueId]);

  const reload = useCallback(async () => {
    const [staffList, shiftList, roleData] = await Promise.all([listVenueStaff(venueId), listVenueWorkShifts(venueId), listVenueRoles(venueId)]);
    setStaff(staffList);
    setShifts(shiftList);
    setRoles(roleData.roles);
  }, [venueId]);

  const load = useCallback(() => {
    setLoadState("loading");
    reload()
      .then(() => setLoadState("ready"))
      .catch(() => setLoadState("failed"));
  }, [reload]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const personOf = useMemo(() => personIndex(staff), [staff]);
  const hours = useMemo(() => parseHoursText(hoursText), [hoursText]);
  const ctx: ScheduleContext = useMemo(() => ({ tz: VENUE_TIME_ZONE, now, personOf, hours }), [now, personOf, hours]);
  // Deactivated (revoked) members are not planned; their future shifts show as "outside the grid".
  const team = useMemo(() => staff.filter((m) => m.status !== "REVOKED"), [staff]);
  const roleGroups = useMemo(() => groupStaffByRole(team, roles, { inScheduleOnly: true }), [team, roles]);
  const plannerIds = useMemo(() => new Set(roleGroups.flatMap((g) => g.members.map((m) => m.id))), [roleGroups]);
  const scheduleRoleKeys = useMemo(() => plannerRoles(roles).map((r) => r.key), [roles]);
  const groupTitle = (g: RoleGroup) => roleLabel(g.role, presetNames);
  const roleName = (key: string) => roleNameByKey(key, roles, presetNames);
  const roleColorOf = (key: string, fallback?: string) => roles.find((r) => r.key === key)?.color || fallback || "#64748b";
  const memberById = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);
  const plannerRole = useCallback((id: string) => (plannerIds.has(id) ? memberById.get(id)?.role : undefined), [plannerIds, memberById]);
  const ended = useCallback((s: WorkShift) => (shiftSpan(s)?.end ?? 0) <= now.getTime(), [now]);

  const weekTo = addDays(weekFrom, 6);
  const weekDates = useMemo(() => datesBetween(weekFrom, addDays(weekFrom, 6)), [weekFrom]);
  const problems = useMemo(() => scheduleProblems(shifts, { personOf }), [shifts, personOf]);
  const weekTotals = useMemo(() => totalsByStaff(shifts, weekFrom, weekTo), [shifts, weekFrom, weekTo]);
  const weekAll = useMemo(() => {
    let count = 0;
    let minutes = 0;
    for (const [id, t] of weekTotals) {
      if (!plannerIds.has(id)) continue;
      count += t.shifts;
      minutes += t.minutes;
    }
    return { count, minutes };
  }, [weekTotals, plannerIds]);

  const alerts = useMemo(
    () =>
      shifts
        .filter((s) => (s.status === "SWAP_REQUESTED" || s.status === "DECLINED") && !ended(s))
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)),
    [shifts, ended],
  );
  useEffect(() => {
    onAlertCountChange?.(alerts.length);
  }, [alerts.length, onAlertCountChange]);

  const hidden = useMemo(
    () =>
      shifts
        .filter((s) => occupiesTime(s) && !ended(s) && !plannerIds.has(s.staff_id))
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)),
    [shifts, ended, plannerIds],
  );
  const conflicts = useMemo(
    () =>
      shifts
        .filter((s) => {
          const pr = problems.get(s.id);
          return pr && (pr.overlap.length > 0 || pr.zeroLength) && !ended(s);
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)),
    [shifts, problems, ended],
  );
  const hasMinimums = scheduleRoleKeys.some((k) => (staffing[k] ?? []).length > 0);
  const weekShort = useMemo(
    () => shortDaysByRole(findShortages(shifts, weekDates.filter((d) => d >= today), scheduleRoleKeys, staffing)),
    [shifts, weekDates, today, scheduleRoleKeys, staffing],
  );

  /* ------------------------------------------------------------ actions */

  async function act(action: () => Promise<Notice>) {
    setBusy(true);
    setNotice(null);
    let ok = false;
    try {
      const result = await action();
      setNotice(result);
      setDialog(null);
      if (result.type === "error") window.requestAnimationFrame(() => noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
      ok = true;
    } catch (err) {
      const conflict = err instanceof PartialError || (err instanceof ApiError && err.status === 409);
      setNotice({ type: "error", text: conflict ? p.serverConflict : p.opError });
      // The schedule is reloaded below, so the dialog's state is stale: close it and show the error.
      setDialog(null);
      window.requestAnimationFrame(() => noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } finally {
      try {
        await reload();
      } catch {
        // The notice already says what happened; the next load retries.
      }
      setBusy(false);
    }
    return ok;
  }

  /** Creates exactly these drafts (grouped into batch requests); returns what the server made. */
  async function createAll(drafts: ShiftDraft[]): Promise<WorkShift[]> {
    const created: WorkShift[] = [];
    for (const group of groupForBatch(drafts)) {
      try {
        created.push(...(await batchCreateVenueWorkShifts(venueId, group)));
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) throw err;
      }
    }
    return created;
  }

  const createdNotice = (created: number, planned: number, text: string): Notice =>
    created < planned ? { type: "error", text: fill(p.partial, { created, planned }) } : { type: "success", text };

  /**
   * Edit / replace: deletes `removeIds`, then creates the drafts. If the server does not take
   * all of them, the new ones are deleted and the old ones put back (they wait for confirmation again).
   */
  async function replaceWith(drafts: ShiftDraft[], removeIds: string[]): Promise<number> {
    const removed = shifts.filter((s) => removeIds.includes(s.id));
    for (const id of removeIds) await deleteVenueWorkShift(venueId, id);
    let created: WorkShift[] = [];
    try {
      created = await createAll(drafts);
      if (created.length < drafts.length) throw new PartialError();
      return created.length;
    } catch (err) {
      for (const s of created) {
        try {
          await deleteVenueWorkShift(venueId, s.id);
        } catch {
          // Best effort; the error notice asks the owner to check the schedule.
        }
      }
      for (const s of removed) {
        try {
          await createVenueWorkShift(venueId, { staff_id: s.staff_id, date: s.date, start_time: s.start_time, end_time: s.end_time, note: s.note });
        } catch {
          // Best effort, as above.
        }
      }
      throw err;
    }
  }

  const submitQuick = (drafts: ShiftDraft[], removeIds: string[], kind: "create" | "edit" | "replace") =>
    act(async () => {
      const created = removeIds.length ? await replaceWith(drafts, removeIds) : (await createAll(drafts)).length;
      const text = kind === "edit" ? p.updated : kind === "replace" ? p.replaced : fill(p.assignedCount, { count: created });
      return createdNotice(created, drafts.length, text);
    });

  const submitBatch = (drafts: ShiftDraft[]) =>
    act(async () => {
      const created = (await createAll(drafts)).length;
      return createdNotice(created, drafts.length, fill(p.assignedCount, { count: created }));
    });

  const submitGenerated = (drafts: ShiftDraft[], removeIds: string[]) =>
    act(async () => {
      for (const id of removeIds) await deleteVenueWorkShift(venueId, id);
      const created = (await createAll(drafts)).length;
      return createdNotice(created, drafts.length, fill(p.created, { count: created }));
    });

  /* -------------------------------------------------------------- views */

  const visibleGroups = roleGroups.filter((g) => roleFilter === "all" || g.role.key === roleFilter);
  const scheduledCount = roleGroups.reduce((n, g) => n + g.members.length, 0);
  const currentWeek = weekStart(today) === weekFrom;
  const rangeLabel = `${formatDate(weekFrom, locale, { day: "numeric", month: "short" })} – ${formatDate(weekTo, locale, { day: "numeric", month: "short" })}`;
  // Day view: the open day; week view: today if it is in this week, else the week's Monday (never the past).
  const weekDefault = today >= weekFrom && today <= weekTo ? today : weekFrom > today ? weekFrom : today;
  const defaultDay = viewMode === "day" ? (selectedDate >= today ? selectedDate : today) : weekDefault;

  function moveWeek(delta: number) {
    setWeekFrom((w) => addDays(w, delta * 7));
    setSelectedDate((d) => addDays(d, delta * 7));
  }

  // Phones show a day or two at a time: bring today's column into view instead of past days.
  useEffect(() => {
    const wrap = matrixRef.current;
    if (!wrap || viewMode !== "matrix" || loadState !== "ready") return;
    const todayCell = wrap.querySelector<HTMLElement>("th.cabinet-roster-th-day.today");
    const sticky = wrap.querySelector<HTMLElement>(".cabinet-roster-th-staff");
    wrap.scrollLeft = todayCell ? Math.max(0, todayCell.offsetLeft - (sticky?.offsetWidth ?? 0)) : 0;
  }, [weekFrom, viewMode, loadState]);

  const coverageFor = (date: string, role: string) => roleDayCoverage(shifts, date, role, staffing[role]);

  return (
    <div className="cabinet-ops cabinet-shifts-planner">
      {notice && (
        <div ref={noticeRef} className={`owner-notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
          <span aria-hidden="true">{notice.type === "error" ? "!" : "✓"}</span>
          <p>{notice.text}</p>
        </div>
      )}
      {loadState === "loading" && <p className="fa-muted">{p.loading}</p>}
      {loadState === "failed" && (
        <div className="owner-notice error" role="alert">
          <span aria-hidden="true">!</span>
          <p>{p.loadError}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={load}>
            {p.retry}
          </button>
        </div>
      )}

      {alerts.length > 0 && (
        <section className="cabinet-planner-swap-banner cabinet-planner-global-alerts" role="alert">
          <span className="cabinet-planner-swap-icon" aria-hidden="true">
            ⚠️
          </span>
          <div className="cabinet-planner-swap-info">
            <div className="cabinet-planner-alerts-head">
              <strong>{fill(p.alertsTitle, { count: alerts.length })}</strong>
            </div>
            {alerts.map((shift) => (
              <div key={shift.id} className="cabinet-planner-swap-row">
                <div className="cabinet-planner-swap-meta">
                  <span className="cabinet-planner-alert-date">{dayLabel(shift.date, today, locale, copy)}</span>
                  <span className="cabinet-planner-swap-name">{shift.staff_name}</span>
                  <RoleBadge label={shiftRoleLabel(shift, presetNames)} color={shift.role_color || roleColorOf(shift.role)} />
                  <ShiftHours className="cabinet-planner-swap-hours" start={shift.start_time} end={shift.end_time} />
                  <span className="cabinet-planner-swap-reason">
                    — {shift.reason ? `«${shift.reason}»` : statusLabel(shift.status, copy)}
                  </span>
                </div>
                <div className="cabinet-planner-swap-row-actions">
                  <button type="button" className="btn btn--primary btn--sm cabinet-planner-swap-action-btn" onClick={() => setDialog({ kind: "swap", shift })}>
                    ⇄ {copy.plannerSwapBtn}
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger-outline btn--sm"
                    aria-label={p.deleteShift}
                    title={p.deleteShift}
                    onClick={() => setDialog({ kind: "delete", shift })}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {conflicts.length > 0 && (
        <section className="shift-banner danger" role="alert">
          <strong>{fill(p.conflictsTitle, { count: conflicts.length })}</strong>
          <p>{p.conflictsBody}</p>
          <ul className="shift-banner-list">
            {conflicts.slice(0, 8).map((s) => (
              <li key={s.id}>
                <button type="button" className="btn btn--link shift-link" onClick={() => setDialog({ kind: "inspect", shift: s })}>
                  {s.staff_name} · {shiftWhen(s, today, locale, copy)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hidden.length > 0 && (
        <section className="shift-banner warn">
          <div className="shift-banner-head">
            <strong>{fill(p.hiddenTitle, { count: hidden.length })}</strong>
            <button type="button" className="btn btn--secondary btn--sm" aria-expanded={showHidden} onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? p.hiddenHide : p.hiddenShow}
            </button>
          </div>
          <p>{p.hiddenBody}</p>
          {showHidden && (
            <ul className="shift-banner-list">
              {hidden.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.staff_name} · <RoleBadge label={shiftRoleLabel(s, presetNames)} color={s.role_color || roleColorOf(s.role)} /> ·{" "}
                    {shiftWhen(s, today, locale, copy)} · <em>{memberById.has(s.staff_id) ? p.hiddenOffSchedule : p.hiddenRemoved}</em>
                  </span>
                  <button type="button" className="btn btn--danger-outline btn--sm" onClick={() => setDialog({ kind: "delete", shift: s })}>
                    {p.deleteShift}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="owner-card cabinet-ops-card cabinet-planner-card">
        <div className="owner-card-head cabinet-planner-head">
          <div>
            <span className="owner-kicker">{copy.shifts}</span>
            <h3>{viewMode === "matrix" ? p.titleWeek : p.titleDay}</h3>
            <p className="cabinet-ops-sub">{copy.shiftsSubtitle}</p>
          </div>
          <div className="cabinet-planner-head-actions">
            <button type="button" className="btn btn--primary btn--md cabinet-planner-add-btn" onClick={() => setDialog({ kind: "batch", date: defaultDay })}>
              {copy.plannerAssignForDay}
            </button>
            <button type="button" className="btn btn--secondary btn--md" onClick={() => setDialog({ kind: "generator", from: defaultDay })}>
              {p.generatorBtn}
            </button>
            <button type="button" className="btn btn--secondary btn--md" onClick={() => setDialog({ kind: "copy" })}>
              {p.copyWeekBtn}
            </button>
          </div>
        </div>

        <div className="cabinet-planner-toolbar">
          <div className="seg cabinet-planner-view-tabs" role="tablist">
            {(
              [
                ["matrix", p.viewWeek],
                ["day", p.viewDay],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={viewMode === value}
                className={`seg-item cabinet-planner-view-tab${viewMode === value ? " is-active" : ""}`}
                onClick={() => setViewMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="cabinet-planner-nav-bar">
            <button type="button" className="btn btn--secondary btn--sm btn--icon cabinet-planner-nav-arrow" aria-label={p.prevWeek} title={p.prevWeek} onClick={() => moveWeek(-1)}>
              ‹
            </button>
            <span className="cabinet-planner-nav-range">{rangeLabel}</span>
            <button type="button" className="btn btn--secondary btn--sm btn--icon cabinet-planner-nav-arrow" aria-label={p.nextWeek} title={p.nextWeek} onClick={() => moveWeek(1)}>
              ›
            </button>
            {!currentWeek && (
              <button
                type="button"
                className="btn btn--secondary btn--sm cabinet-planner-nav-today"
                onClick={() => {
                  setWeekFrom(weekStart(today));
                  setSelectedDate(today);
                }}
              >
                {p.today}
              </button>
            )}
          </div>

          {viewMode === "matrix" && (
            <div className="cabinet-planner-role-filter" role="group">
              <button type="button" aria-pressed={roleFilter === "all"} className={`chip${roleFilter === "all" ? " is-active" : ""}`} onClick={() => setRoleFilter("all")}>
                {fill(p.allPeople, { count: scheduledCount })}
              </button>
              {roleGroups.map((g) => (
                <button
                  key={g.role.key}
                  type="button"
                  aria-pressed={roleFilter === g.role.key}
                  className={`chip${roleFilter === g.role.key ? " is-active" : ""}`}
                  onClick={() => setRoleFilter(g.role.key)}
                >
                  <span className="cabinet-role-pill-dot" style={{ "--role-color": g.role.color } as CSSProperties} aria-hidden="true" />
                  {`${groupTitle(g)} (${g.members.length})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {weekShort.size > 0 ? (
          <div className="shift-short-summary" role="status">
            <strong>{p.shortSummary}</strong>
            {[...weekShort].map(([role, days]) => (
              <span key={role} className="shift-short-chip" style={{ "--role-color": roleColorOf(role) } as CSSProperties}>
                <i aria-hidden="true" />
                {roleName(role)} — {days.length} {plural(days.length, p.dayForms, locale)}
              </span>
            ))}
            <small>{p.shortHint}</small>
          </div>
        ) : (
          !hasMinimums && scheduledCount > 0 && <p className="shift-min-hint">{p.noMinimums}</p>
        )}

        {viewMode === "matrix" ? (
          <div className="cabinet-roster-matrix-wrap" ref={matrixRef}>
            {scheduledCount === 0 ? (
              <div className="cabinet-planner-col-empty">
                <p>{team.length === 0 ? copy.roles.plannerEmptyStaff : copy.roles.plannerEmptyRoles}</p>
              </div>
            ) : (
              <table className="cabinet-roster-table">
                <thead>
                  <tr>
                    <th className="cabinet-roster-sticky-col cabinet-roster-th-staff">{p.staffCol}</th>
                    {weekDates.map((date) => (
                      <th key={date} className={`cabinet-roster-th-day ${date === today ? "today" : ""} ${date < today ? "past" : ""}`}>
                        <button
                          type="button"
                          className="cabinet-roster-day-head-btn"
                          title={p.openDay}
                          onClick={() => {
                            setSelectedDate(date);
                            setViewMode("day");
                          }}
                        >
                          <span className="cabinet-roster-day-name">{formatDate(date, locale, { weekday: "short", day: "numeric" })}</span>
                          <span className="cabinet-roster-coverage">
                            {roleGroups.map((g) => (
                              <CoverageChip key={g.role.key} cov={coverageFor(date, g.role.key)} title={groupTitle(g)} color={g.role.color} past={date < today} p={p} />
                            ))}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleGroups.map((group) => (
                    <RosterGroupRows
                      key={group.role.key}
                      title={groupTitle(group)}
                      group={group}
                      weekDates={weekDates}
                      today={today}
                      shifts={shifts}
                      problems={problems}
                      weekTotals={weekTotals}
                      ended={ended}
                      locale={locale}
                      copy={copy}
                      onFocusStaff={(member) => setDialog({ kind: "personal", member })}
                      onInspectShift={(shift) => setDialog({ kind: "inspect", shift })}
                      onQuickAdd={(member, date) => setDialog({ kind: "quick", mode: { kind: "create", member, date } })}
                    />
                  ))}
                </tbody>
              </table>
            )}

            <div className="cabinet-roster-legend">
              <span>
                <i className="legend-dot confirmed" /> {copy.opsScheduleConfirmed}
              </span>
              <span>
                <i className="legend-dot pending" /> {copy.opsSchedulePending}
              </span>
              <span>
                <i className="legend-dot swap_requested" /> {copy.staffSwapStatusBadge}
              </span>
              <span>
                <i className="legend-dot declined" /> {copy.opsScheduleDeclined}
              </span>
              <span>
                <i className="legend-dot conflict" /> {p.legendConflict}
              </span>
              <span>
                <i className="legend-dot rest" /> {p.legendRest}
              </span>
              <span>{p.legendNextDay}</span>
              <span className="shift-week-total">{fill(p.weekSummary, { shifts: weekAll.count, hours: formatHours(weekAll.minutes, p, locale) })}</span>
              <span className="cabinet-roster-legend-tip">{p.tip}</span>
            </div>
          </div>
        ) : (
          <DayView
            weekDates={weekDates}
            selectedDate={selectedDate}
            today={today}
            onSelect={setSelectedDate}
            roles={roles}
            scheduleRoleKeys={scheduleRoleKeys}
            shifts={shifts}
            problems={problems}
            staffing={staffing}
            hoursRange={hours}
            ended={ended}
            locale={locale}
            copy={copy}
            presetNames={presetNames}
            onAssign={(date) => setDialog({ kind: "batch", date: date >= today ? date : today })}
            onInspect={(shift) => setDialog({ kind: "inspect", shift })}
            onSwap={(shift) => setDialog({ kind: "swap", shift })}
            onDelete={(shift) => setDialog({ kind: "delete", shift })}
          />
        )}
      </section>

      {dialog?.kind === "batch" && (
        <BatchAssignDialog
          key={dialog.date}
          initialDate={dialog.date}
          groups={roleGroups}
          groupTitle={groupTitle}
          shifts={shifts}
          staffing={staffing}
          ctx={ctx}
          today={today}
          locale={locale}
          copy={copy}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={submitBatch}
        />
      )}

      {dialog?.kind === "quick" && (
        <QuickShiftDialog
          key={dialog.mode.kind === "edit" ? dialog.mode.shift.id : `${dialog.mode.member.id}|${dialog.mode.date}`}
          mode={dialog.mode}
          shifts={shifts}
          ctx={ctx}
          today={today}
          locale={locale}
          copy={copy}
          roleName={roleName}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={submitQuick}
        />
      )}

      {dialog?.kind === "generator" && (
        <GeneratorDialog
          initialFrom={dialog.from}
          groups={roleGroups}
          groupTitle={groupTitle}
          roleName={roleName}
          shifts={shifts}
          staffing={staffing}
          ctx={ctx}
          locale={locale}
          copy={copy}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={submitGenerated}
        />
      )}

      {dialog?.kind === "copy" && (
        <CopyWeekDialog
          weekFrom={weekFrom}
          shifts={shifts}
          plannerRole={plannerRole}
          ctx={ctx}
          locale={locale}
          copy={copy}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(drafts) =>
            act(async () => {
              const created = (await createAll(drafts)).length;
              return createdNotice(created, drafts.length, fill(p.copied, { count: created }));
            })
          }
        />
      )}

      {dialog?.kind === "personal" && (
        <PersonalDialog
          member={dialog.member}
          shifts={shifts}
          problems={problems}
          weekFrom={weekFrom}
          monthOf={selectedDate}
          today={today}
          ended={ended}
          roleName={roleName}
          locale={locale}
          copy={copy}
          onClose={() => setDialog(null)}
          onAdd={(member) => setDialog({ kind: "quick", mode: { kind: "create", member, date: defaultDay } })}
          onInspect={(shift) => setDialog({ kind: "inspect", shift })}
        />
      )}

      {dialog?.kind === "inspect" && (
        <InspectDialog
          shift={dialog.shift}
          problem={problems.get(dialog.shift.id)}
          isEnded={ended(dialog.shift)}
          inTeam={memberById.has(dialog.shift.staff_id)}
          today={today}
          locale={locale}
          copy={copy}
          color={dialog.shift.role_color || roleColorOf(dialog.shift.role)}
          roleText={shiftRoleLabel(dialog.shift, presetNames)}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ kind: "quick", mode: { kind: "edit", shift: dialog.shift, member: memberById.get(dialog.shift.staff_id) } })}
          onSwap={() => setDialog({ kind: "swap", shift: dialog.shift })}
          onAddSameDay={() => {
            const member = memberById.get(dialog.shift.staff_id);
            if (member) setDialog({ kind: "quick", mode: { kind: "create", member, date: dialog.shift.date } });
          }}
          onDelete={() => setDialog({ kind: "delete", shift: dialog.shift })}
        />
      )}

      {dialog?.kind === "swap" && (
        <SwapDialog
          shift={dialog.shift}
          staff={team}
          shifts={shifts}
          ctx={ctx}
          isEnded={ended(dialog.shift)}
          today={today}
          locale={locale}
          copy={copy}
          color={dialog.shift.role_color || roleColorOf(dialog.shift.role)}
          roleText={shiftRoleLabel(dialog.shift, presetNames)}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(memberId) =>
            act(async () => {
              await swapVenueWorkShiftStaff(venueId, dialog.shift.id, memberId);
              return { type: "success", text: p.swapDone };
            })
          }
        />
      )}

      {dialog?.kind === "delete" && (
        <ShiftDialog open size="small" onClose={() => setDialog(null)} title={p.deleteTitle} closeLabel={copy.opsMenuCancel}>
          <p className="cabinet-delete-text">{fill(p.deleteBody, { name: dialog.shift.staff_name, when: shiftWhen(dialog.shift, today, locale, copy) })}</p>
          <div className="cabinet-delete-actions">
            <button
              type="button"
              className="btn btn--danger btn--md"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await deleteVenueWorkShift(venueId, dialog.shift.id);
                  return { type: "success", text: p.deleted };
                })
              }
            >
              {p.deleteShift}
            </button>
            <button type="button" className="btn btn--ghost btn--md" data-autofocus disabled={busy} onClick={() => setDialog(null)}>
              {copy.opsMenuCancel}
            </button>
          </div>
        </ShiftDialog>
      )}
    </div>
  );
}

/* ================================================================ parts */

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

function coverageText(cov: RoleDayCoverage, title: string, p: CabinetCopy["shiftPlan"]): string {
  const lines = [cov.need ? fill(p.coverageOf, { role: title, have: cov.people, need: cov.need }) : fill(p.coveragePeople, { role: title, have: cov.people })];
  for (const r of cov.rules) {
    if (!isWindowRule(r.rule)) continue;
    lines.push(fill(p.coverageWindow, { from: r.rule.from!, to: r.rule.to!, have: r.have, need: r.need }));
  }
  if (cov.short) lines.push(p.belowMin);
  return lines.join("\n");
}

function CoverageChip({
  cov,
  title,
  color,
  past,
  p,
}: {
  cov: RoleDayCoverage;
  title: string;
  color: string;
  past: boolean;
  p: CabinetCopy["shiftPlan"];
}) {
  // Red: the day's minimum is not met; amber: only some hours (a time window) are short.
  const dayShort = !past && cov.rules.some((r) => r.short && !isWindowRule(r.rule));
  const short = cov.short && !past;
  const state = dayShort ? "short" : short ? "short-window" : cov.rules.length ? "ok" : "";
  return (
    <span className={`cabinet-coverage-chip ${state}`} style={{ "--role-color": color } as CSSProperties} title={coverageText(cov, title, p)}>
      <i aria-hidden="true" />
      {cov.need ? `${cov.people}/${cov.need}` : cov.people}
      {short && <b aria-hidden="true">!</b>}
    </span>
  );
}

function RosterGroupRows({
  group,
  title,
  weekDates,
  today,
  shifts,
  problems,
  weekTotals,
  ended,
  locale,
  copy,
  onFocusStaff,
  onInspectShift,
  onQuickAdd,
}: {
  group: RoleGroup;
  title: string;
  weekDates: string[];
  today: string;
  shifts: WorkShift[];
  problems: Problems;
  weekTotals: Map<string, { shifts: number; minutes: number }>;
  ended: (s: WorkShift) => boolean;
  locale: Locale;
  copy: CabinetCopy;
  onFocusStaff: (member: StaffMember) => void;
  onInspectShift: (shift: WorkShift) => void;
  onQuickAdd: (member: StaffMember, date: string) => void;
}) {
  const p = copy.shiftPlan;
  if (group.members.length === 0) return null;
  const cells = new Map<string, WorkShift[]>();
  for (const s of shifts) {
    const key = `${s.staff_id}|${s.date}`;
    cells.set(key, [...(cells.get(key) ?? []), s]);
  }
  return (
    <>
      <tr className="cabinet-roster-group-row">
        <th colSpan={weekDates.length + 1} scope="colgroup" className="cabinet-roster-group-head">
          <span className="cabinet-roster-group-label">
            <RoleBadge label={title} color={group.role.color} /> ({group.members.length})
          </span>
        </th>
      </tr>
      {group.members.map((member) => {
        const name = memberName(member);
        const totals = weekTotals.get(member.id);
        const over = (totals?.minutes ?? 0) > WEEK_LIMIT_MINUTES;
        return (
          <tr key={member.id} className="cabinet-roster-staff-row">
            <th scope="row" className="cabinet-roster-sticky-col cabinet-roster-staff-cell">
              <button type="button" className="cabinet-roster-staff-btn" onClick={() => onFocusStaff(member)}>
                <span className="cabinet-staff-avatar xs" aria-hidden="true">
                  {name.slice(0, 2).toUpperCase()}
                </span>
                <span className="cabinet-roster-staff-meta">
                  <strong>{name}</strong>
                  <small className={over ? "over" : ""} title={over ? p.overWeekLimit : undefined}>
                    {totals && totals.shifts > 0
                      ? `${over ? "⚠ " : ""}${fill(p.personWeek, { count: totals.shifts, hours: formatHours(totals.minutes, p, locale) })}`
                      : p.off}
                  </small>
                </span>
              </button>
            </th>
            {weekDates.map((date) => {
              const list = (cells.get(`${member.id}|${date}`) ?? []).sort((a, b) => a.start_time.localeCompare(b.start_time));
              return (
                <td key={date} className={`cabinet-roster-day-cell ${date === today ? "today" : ""} ${date < today ? "past" : ""}`}>
                  <div className="cabinet-roster-cell-inner">
                    {list.map((shift) => {
                      const pr = problems.get(shift.id);
                      const conflict = Boolean(pr && (pr.overlap.length || pr.zeroLength));
                      const rest = Boolean(pr && pr.shortRest.length);
                      const notes = [
                        statusLabel(shift.status, copy),
                        ...(pr?.overlap.map((o) => fill(p.issueOverlap, { when: shiftWhen(o, today, locale, copy) })) ?? []),
                        ...(pr?.zeroLength ? [p.issueZero] : []),
                        ...(pr?.shortRest.map((r) => fill(p.issueRest, { rest: formatDuration(r.restMinutes, p), when: shiftWhen(r.shift, today, locale, copy) })) ?? []),
                        ...(shift.note ? [shift.note] : []),
                        ...(shift.reason ? [shift.reason] : []),
                      ];
                      return (
                        <button
                          key={shift.id}
                          type="button"
                          className={`cabinet-roster-shift-chip status-${shift.status.toLowerCase()} ${conflict ? "conflict" : ""} ${rest ? "rest" : ""} ${ended(shift) ? "past" : ""}`}
                          onClick={() => onInspectShift(shift)}
                          title={notes.join("\n")}
                        >
                          <span className="chip-icon" aria-hidden="true">
                            {conflict ? "⛔" : statusIcon(shift.status)}
                          </span>
                          <ShiftHours className="chip-hours" start={shift.start_time} end={shift.end_time} />
                        </button>
                      );
                    })}
                    {date >= today && (
                      <button
                        type="button"
                        className={`cabinet-roster-cell-add ${list.length ? "compact" : ""}`}
                        onClick={() => onQuickAdd(member, date)}
                        aria-label={fill(p.addShiftAria, { name, date: formatDate(date, locale, { weekday: "short", day: "numeric", month: "short" }) })}
                      >
                        {list.length ? p.addAnother : "+"}
                      </button>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function DayView({
  weekDates,
  selectedDate,
  today,
  onSelect,
  roles,
  scheduleRoleKeys,
  shifts,
  problems,
  staffing,
  hoursRange,
  ended,
  locale,
  copy,
  presetNames,
  onAssign,
  onInspect,
  onSwap,
  onDelete,
}: {
  weekDates: string[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
  roles: VenueRole[];
  scheduleRoleKeys: string[];
  shifts: WorkShift[];
  problems: Problems;
  staffing: StaffingByRole;
  hoursRange: { open: number; close: number } | null;
  ended: (s: WorkShift) => boolean;
  locale: Locale;
  copy: CabinetCopy;
  presetNames: Record<string, string>;
  onAssign: (date: string) => void;
  onInspect: (shift: WorkShift) => void;
  onSwap: (shift: WorkShift) => void;
  onDelete: (shift: WorkShift) => void;
}) {
  const p = copy.shiftPlan;
  const dayShifts = shifts.filter((s) => s.date === selectedDate);
  const keys = [...scheduleRoleKeys];
  for (const s of dayShifts) if (!keys.includes(s.role)) keys.push(s.role);
  const groups = keys
    .map((key) => {
      const role = roles.find((r) => r.key === key);
      const list = dayShifts.filter((s) => s.role === key).sort((a, b) => a.start_time.localeCompare(b.start_time));
      return {
        key,
        title: role ? roleLabel(role, presetNames) : shiftRoleLabel(list[0] ?? { role: key, role_name: "" }, presetNames),
        color: role?.color || list[0]?.role_color || "#64748b",
        shifts: list,
        inSchedule: Boolean(role?.in_schedule),
      };
    })
    .filter((g) => g.inSchedule || g.shifts.length > 0);

  // Timeline: the venue's hours, else the hours the day's shifts cover.
  const spans = dayShifts.filter(occupiesTime).map((s) => {
    const st = parseTime(s.start_time) ?? 0;
    const en = parseTime(s.end_time) ?? 0;
    return { st, en: en <= st ? en + 1440 : en };
  });
  const open = hoursRange?.open ?? (spans.length ? Math.min(...spans.map((x) => x.st)) : 8 * 60);
  const close = hoursRange?.close ?? (spans.length ? Math.max(...spans.map((x) => x.en)) : 23 * 60);
  const from = Math.floor(open / 60) * 60;
  const to = Math.min(Math.ceil(close / 60) * 60, from + 24 * 60);

  return (
    <>
      <div className="cabinet-planner-week-strip">
        <div className="cabinet-planner-days-grid" role="tablist">
          {weekDates.map((date) => {
            const hasAlert = shifts.some((s) => s.date === date && (s.status === "SWAP_REQUESTED" || s.status === "DECLINED"));
            return (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={date === selectedDate}
                className={`cabinet-planner-day-pill ${date === selectedDate ? "active" : ""} ${date === today ? "today" : ""} ${date < today ? "past" : ""}`}
                onClick={() => onSelect(date)}
              >
                <span className="cabinet-planner-day-name">{formatDate(date, locale, { weekday: "short" })}</span>
                <strong className="cabinet-planner-day-num">{formatDate(date, locale, { day: "numeric" })}</strong>
                <span className="cabinet-planner-day-counts">
                  {groups.map((g) => {
                    const cov = roleDayCoverage(shifts, date, g.key, staffing[g.key]);
                    if (!cov.people && !cov.rules.length) return null;
                    return <CoverageChip key={g.key} cov={cov} title={g.title} color={g.color} past={date < today} p={p} />;
                  })}
                </span>
                {hasAlert && <span className="cabinet-planner-day-alert-dot" title={copy.plannerSwapRequestAlert} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cabinet-planner-day-header">
        <div>
          <h4 className="cabinet-planner-day-title shift-day-title">{capitalize(formatDate(selectedDate, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</h4>
          <span className="cabinet-planner-day-summary">
            {copy.roles.plannerOnShift}:{" "}
            {groups
              .map((g) => {
                const cov = roleDayCoverage(shifts, selectedDate, g.key, staffing[g.key]);
                return `${g.title} ${cov.need ? `${cov.people}/${cov.need}` : cov.people}`;
              })
              .join(" · ")}
          </span>
        </div>
        {selectedDate >= today && (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => onAssign(selectedDate)}>
            {copy.opsScheduleAddBtn}
          </button>
        )}
      </div>

      <div className="cabinet-planner-columns">
        {groups.length === 0 && (
          <div className="cabinet-planner-col-empty">
            <p>{copy.roles.plannerEmptyRoles}</p>
          </div>
        )}
        {groups.map((g) => {
          const cov = roleDayCoverage(shifts, selectedDate, g.key, staffing[g.key]);
          const windows = rulesForDate(staffing[g.key], selectedDate).filter(isWindowRule);
          const slots = hourlyHeadcount(shifts, selectedDate, g.key, from, to).map((slot) => {
            const need = Math.max(
              0,
              ...windows
                .filter((r) => {
                  const a = parseTime(r.from!)!;
                  let b = parseTime(r.to!)!;
                  if (b <= a) b += 1440;
                  return slot.from < b && slot.to > a;
                })
                .map((r) => r.min),
            );
            return { ...slot, need };
          });
          return (
            <div key={g.key} className="cabinet-planner-col">
              <div className="cabinet-planner-col-head">
                <div className="cabinet-planner-col-title-wrap">
                  <RoleBadge label={g.title} color={g.color} />
                  <h5 className={selectedDate < today ? "" : cov.rules.some((r) => r.short && !isWindowRule(r.rule)) ? "short" : cov.short ? "short-window" : ""}>
                    ({cov.need ? `${cov.people}/${cov.need}` : cov.people})
                  </h5>
                </div>
              </div>
              <div className="shift-timeline" role="img" aria-label={`${p.timelineTitle}: ${g.title}`}>
                {slots.map((s) => (
                  <span
                    key={s.from}
                    className={`shift-timeline-slot ${s.people === 0 ? "empty" : ""} ${s.need && s.people < s.need ? "short" : ""}`}
                    title={`${formatTime(s.from)}–${formatTime(s.to)}: ${s.need ? `${s.people}/${s.need}` : s.people}`}
                  >
                    <b>{s.people}</b>
                    {s.from % 120 === 0 && <small>{formatTime(s.from).slice(0, 2)}</small>}
                  </span>
                ))}
              </div>
              {g.shifts.length === 0 ? (
                <div className="cabinet-planner-col-empty">
                  <p>{copy.roles.plannerNoneOnShift}</p>
                  {selectedDate >= today && (
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => onAssign(selectedDate)}>
                      {copy.plannerAssignForDay}
                    </button>
                  )}
                </div>
              ) : (
                <ul className="cabinet-planner-cards-list">
                  {g.shifts.map((shift) => {
                    const pr = problems.get(shift.id);
                    const conflict = Boolean(pr && (pr.overlap.length || pr.zeroLength));
                    const isAlert = shift.status === "SWAP_REQUESTED" || shift.status === "DECLINED";
                    const span = shiftSpan(shift);
                    const past = ended(shift);
                    return (
                      <li key={shift.id} className={`cabinet-planner-shift-card ${isAlert ? "alert" : ""} ${conflict ? "conflict" : ""} ${past ? "past" : ""}`}>
                        <div className="cabinet-planner-card-top">
                          <button type="button" className="cabinet-planner-card-staff shift-card-open" onClick={() => onInspect(shift)}>
                            <span className="cabinet-staff-avatar sm" aria-hidden="true">
                              {shift.staff_name.slice(0, 2).toUpperCase()}
                            </span>
                            <span>
                              <strong className="cabinet-planner-card-name">{shift.staff_name}</strong>
                              <span className="cabinet-planner-card-hours">
                                <ShiftHours start={shift.start_time} end={shift.end_time} /> {span && <small>({formatDuration(span.minutes, p)})</small>}
                              </span>
                            </span>
                          </button>
                          <span className={`cabinet-shift-status-badge ${shift.status.toLowerCase()}`}>
                            {statusIcon(shift.status)} {statusLabel(shift.status, copy)}
                          </span>
                        </div>
                        {conflict && <p className="shift-card-issue">⛔ {pr!.zeroLength ? p.issueZero : fill(p.issueOverlap, { when: shiftWhen(pr!.overlap[0], today, locale, copy) })}</p>}
                        {!conflict && pr?.shortRest.length ? (
                          <p className="shift-card-issue warn">
                            ⏱ {fill(p.issueRest, { rest: formatDuration(pr.shortRest[0].restMinutes, p), when: shiftWhen(pr.shortRest[0].shift, today, locale, copy) })}
                          </p>
                        ) : null}
                        {shift.note && <p className="cabinet-planner-card-note">📍 {shift.note}</p>}
                        {shift.reason && (
                          <div className="cabinet-planner-card-reason">
                            <strong>{p.reason}</strong>
                            <p>{shift.reason}</p>
                          </div>
                        )}
                        {!past && (
                          <div className="cabinet-planner-card-actions">
                            <button type="button" className="btn btn--secondary btn--sm" onClick={() => onSwap(shift)}>
                              ⇄ {copy.plannerSwapBtn}
                            </button>
                            <button type="button" className="btn btn--danger-outline btn--sm" aria-label={p.deleteShift} title={p.deleteShift} onClick={() => onDelete(shift)}>
                              ✕
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function InspectDialog({
  shift,
  problem,
  isEnded,
  inTeam,
  today,
  locale,
  copy,
  color,
  roleText,
  onClose,
  onEdit,
  onSwap,
  onAddSameDay,
  onDelete,
}: {
  shift: WorkShift;
  problem: ReturnType<Problems["get"]>;
  isEnded: boolean;
  /** False for a shift of someone removed from the team: it can only be handed over or deleted. */
  inTeam: boolean;
  today: string;
  locale: Locale;
  copy: CabinetCopy;
  color: string;
  roleText: string;
  onClose: () => void;
  onEdit: () => void;
  onSwap: () => void;
  onAddSameDay: () => void;
  onDelete: () => void;
}) {
  const p = copy.shiftPlan;
  const span = shiftSpan(shift);
  const blocking = [
    ...(problem?.zeroLength ? [{ code: "zero_length" as const }] : []),
    ...(problem?.overlap.map((o) => ({ code: "overlap" as const, shift: o })) ?? []),
  ];
  const warnings = problem?.shortRest.map((r) => ({ code: "short_rest" as const, shift: r.shift, restMinutes: r.restMinutes })) ?? [];
  return (
    <ShiftDialog open onClose={onClose} title={shift.staff_name} sub={`${dayLabel(shift.date, today, locale, copy)} · ${formatDate(shift.date, locale, { day: "numeric", month: "long", year: "numeric" })}`} closeLabel={copy.opsMenuCancel}>
      <div className="cabinet-planner-swap-target-box">
        <div className="shift-inspect-row">
          <strong>
            <ShiftHours start={shift.start_time} end={shift.end_time} />
          </strong>
          <RoleBadge label={roleText} color={color} />
          <span className={`cabinet-shift-status-badge ${shift.status.toLowerCase()}`}>{statusLabel(shift.status, copy)}</span>
        </div>
        {span && (
          <p className="shift-length-note">
            {fill(p.length, { hours: formatDuration(span.minutes, p) })}
            {span.overnight && <> · {fill(p.endsNextDay, { time: shift.end_time })}</>}
          </p>
        )}
        {shift.note && <p className="cabinet-planner-card-note">📍 {shift.note}</p>}
        {shift.reason && (
          <p className="cabinet-planner-swap-target-reason">
            {p.reason} {shift.reason}
          </p>
        )}
      </div>
      {(blocking.length > 0 || warnings.length > 0) && (
        <IssueList blocking={blocking} warnings={warnings} today={today} locale={locale} copy={copy} blockedTitle={p.legendConflict} />
      )}
      {isEnded ? (
        <p className="shift-dialog-hint">{p.issueEnded}</p>
      ) : (
        <div className="cabinet-shift-actions shift-inspect-actions">
          {inTeam && (
            <button type="button" className="btn btn--primary btn--md" onClick={onEdit}>
              {p.editTime}
            </button>
          )}
          <button type="button" className="btn btn--secondary btn--md" onClick={onSwap}>
            ⇄ {copy.plannerSwapBtn}
          </button>
          {inTeam && (
            <button type="button" className="btn btn--secondary btn--md" onClick={onAddSameDay}>
              + {p.addSplit}
            </button>
          )}
          <button type="button" className="btn btn--danger-outline btn--md" onClick={onDelete}>
            {p.deleteShift}
          </button>
        </div>
      )}
    </ShiftDialog>
  );
}

function SwapDialog({
  shift,
  staff,
  shifts,
  ctx,
  isEnded,
  today,
  locale,
  copy,
  color,
  roleText,
  busy,
  onClose,
  onSubmit,
}: {
  shift: WorkShift;
  staff: StaffMember[];
  shifts: WorkShift[];
  ctx: ScheduleContext;
  isEnded: boolean;
  today: string;
  locale: Locale;
  copy: CabinetCopy;
  color: string;
  roleText: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (memberId: string) => Promise<boolean>;
}) {
  const p = copy.shiftPlan;
  const candidates = useMemo(() => {
    const swapCtx = { ...ctx, ignoreIds: new Set([shift.id]) };
    const holder = ctx.personOf?.(shift.staff_id);
    return staff
      .filter((m) => m.role === shift.role && m.id !== shift.staff_id && ctx.personOf?.(m.id) !== holder)
      .map((m) => {
        const r = checkShift({ ...shift, id: undefined, status: undefined, staff_id: m.id }, shifts, swapCtx);
        // For another person the same hours simply mean "busy then".
        const blocking = r.blocking
          .filter((i) => i.code !== "ended" && i.code !== "started")
          .map((i) => (i.code === "duplicate" ? { code: "overlap" as const, shift: i.shift } : i));
        const warnings = r.warnings.filter((i) => i.code !== "started" && i.code !== "long_shift" && i.code !== "outside_hours");
        return { member: m, blocking, warnings, invited: m.status !== "ACTIVE" };
      })
      .sort((a, b) => Number(a.blocking.length > 0) - Number(b.blocking.length > 0) || a.warnings.length - b.warnings.length);
  }, [shift, staff, shifts, ctx]);
  const [choice, setChoice] = useState(() => candidates.find((c) => !c.blocking.length)?.member.id ?? "");

  return (
    <ShiftDialog open size="wide" onClose={onClose} title={copy.plannerSwapModalTitle} sub={copy.plannerSwapModalSub.replace("{name}", shift.staff_name)} closeLabel={copy.opsMenuCancel}>
      <div className="cabinet-planner-swap-target-box">
        <div className="shift-inspect-row">
          <strong>
            {dayLabel(shift.date, today, locale, copy)} · <ShiftHours start={shift.start_time} end={shift.end_time} />
          </strong>
          <RoleBadge label={roleText} color={color} />
        </div>
        {shift.reason && (
          <p className="cabinet-planner-swap-target-reason">
            {p.reason} {shift.reason}
          </p>
        )}
      </div>
      {isEnded ? (
        <p className="shift-dialog-hint">{p.issueEnded}</p>
      ) : (
        <form
          className="cabinet-shift-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (choice && !busy) void onSubmit(choice);
          }}
        >
          <div className="cabinet-shift-field-group">
            <span className="shift-field-label">{copy.plannerSelectReplacement}</span>
            {candidates.length === 0 ? (
              <p className="cabinet-swap-empty-note">{p.swapNone}</p>
            ) : (
              <div className="cabinet-swap-candidates-list" role="radiogroup" aria-label={copy.plannerSelectReplacement}>
                {candidates.map(({ member, blocking, warnings, invited }) => {
                  const name = memberName(member);
                  const blocked = blocking.length > 0;
                  const selected = !blocked && choice === member.id;
                  const note = blocked
                    ? issueLine(blocking[0], today, locale, copy)
                    : warnings.length
                      ? issueLine(warnings[0], today, locale, copy)
                      : invited
                        ? p.issueInvited
                        : p.available;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={blocked}
                      className={`cabinet-swap-candidate-card ${selected ? "selected" : ""} ${blocked ? "busy" : "free"}`}
                      onClick={() => setChoice(member.id)}
                    >
                      <div className="cabinet-swap-candidate-left">
                        <span className="cabinet-shift-checkbox" aria-hidden="true">
                          {blocked ? "✕" : selected ? "✓" : ""}
                        </span>
                        <span className="cabinet-staff-avatar xs" aria-hidden="true">
                          {name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="cabinet-swap-candidate-info">
                          <strong>{name}</strong>
                          <small>{member.email}</small>
                        </div>
                      </div>
                      <span className={`cabinet-swap-availability-pill ${blocked ? "busy" : warnings.length || invited ? "warn" : "free"}`}>{note}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="cabinet-shift-actions">
            <button type="submit" className="btn btn--primary btn--md" disabled={busy || !choice}>
              ⇄ {copy.plannerConfirmSwap}
            </button>
            <button type="button" className="btn btn--ghost btn--md" disabled={busy} onClick={onClose}>
              {copy.opsMenuCancel}
            </button>
          </div>
        </form>
      )}
    </ShiftDialog>
  );
}

function CopyWeekDialog({
  weekFrom,
  shifts,
  plannerRole,
  ctx,
  locale,
  copy,
  busy,
  onClose,
  onSubmit,
}: {
  weekFrom: string;
  shifts: WorkShift[];
  plannerRole: (staffId: string) => string | undefined;
  ctx: ScheduleContext;
  locale: Locale;
  copy: CabinetCopy;
  busy: boolean;
  onClose: () => void;
  onSubmit: (drafts: ShiftDraft[]) => Promise<boolean>;
}) {
  const p = copy.shiftPlan;
  const source = addDays(weekFrom, -7);
  const { drafts, leftOut } = useMemo(() => copyWeekDrafts(shifts, source, weekFrom, plannerRole), [shifts, source, weekFrom, plannerRole]);
  const plan = useMemo(() => planShifts(drafts, shifts, ctx), [drafts, shifts, ctx]);
  const by = (codes: string[]) => plan.skipped.filter((s) => codes.includes(s.reason.code)).length;
  const parts = [
    [p.skipOverlap, by(["overlap"])],
    [p.skipDuplicate, by(["duplicate"])],
    [p.skipEnded, by(["ended"])],
    [p.skipInvalid, by(["invalid_time", "zero_length"])],
    [p.copyLeftOut, leftOut.length],
  ].filter(([, n]) => (n as number) > 0) as [string, number][];
  const range = (from: string) =>
    `${formatDate(from, locale, { day: "numeric", month: "short" })} – ${formatDate(addDays(from, 6), locale, { day: "numeric", month: "short" })}`;
  const restWarnings = plan.accepted.filter((a) => a.warnings.some((w) => w.code === "short_rest")).length;

  return (
    <ShiftDialog open size="small" onClose={onClose} title={p.copyTitle} closeLabel={copy.opsMenuCancel}>
      <div className="cabinet-copy-icon" aria-hidden="true">
        📋
      </div>
      {drafts.length === 0 && leftOut.length === 0 ? (
        <p className="cabinet-delete-text">{p.copyNothing}</p>
      ) : (
        <div className="shift-gen-preview">
          <p>{fill(p.copyBody, { from: range(source), to: range(weekFrom) })}</p>
          <p>
            <strong>{fill(p.previewCreate, { count: plan.accepted.length })}</strong>
          </p>
          {parts.length > 0 && (
            <p className="muted">
              {fill(p.previewSkipped, { count: plan.skipped.length + leftOut.length })}: {parts.map(([label, n]) => fill(label, { count: n })).join(", ")}
            </p>
          )}
          {restWarnings > 0 && <p className="warn">⏱ {p.legendRest}: {restWarnings}</p>}
        </div>
      )}
      <div className="cabinet-delete-actions">
        <button
          type="button"
          className="btn btn--primary btn--md"
          disabled={busy || plan.accepted.length === 0}
          onClick={() => void onSubmit(plan.accepted.map((a) => a.draft))}
        >
          {fill(p.copyCount, { count: plan.accepted.length })}
        </button>
        <button type="button" className="btn btn--ghost btn--md" data-autofocus disabled={busy} onClick={onClose}>
          {copy.opsMenuCancel}
        </button>
      </div>
    </ShiftDialog>
  );
}

function PersonalDialog({
  member,
  shifts,
  problems,
  weekFrom,
  monthOf,
  today,
  ended,
  roleName,
  locale,
  copy,
  onClose,
  onAdd,
  onInspect,
}: {
  member: StaffMember;
  shifts: WorkShift[];
  problems: Problems;
  weekFrom: string;
  monthOf: string;
  today: string;
  ended: (s: WorkShift) => boolean;
  roleName: (key: string) => string;
  locale: Locale;
  copy: CabinetCopy;
  onClose: () => void;
  onAdd: (member: StaffMember) => void;
  onInspect: (shift: WorkShift) => void;
}) {
  const p = copy.shiftPlan;
  const [showPast, setShowPast] = useState(false);
  const mine = shifts.filter((s) => s.staff_id === member.id).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  const week = totalsByStaff(mine, weekFrom, addDays(weekFrom, 6)).get(member.id);
  const month = monthBounds(monthOf);
  const monthTotals = totalsByStaff(mine, month.start, month.end).get(member.id);
  const upcoming = mine.filter((s) => !ended(s));
  const past = mine.filter((s) => ended(s));
  const name = memberName(member);
  const list = showPast ? [...past, ...upcoming] : upcoming;

  return (
    <ShiftDialog open size="wide" onClose={onClose} title={name} sub={`${roleName(member.role)} · ${member.email}`} closeLabel={copy.opsMenuCancel}>
      <div className="cabinet-personal-stats">
        <div>
          <span>{p.statWeek}</span>
          <strong className={(week?.minutes ?? 0) > WEEK_LIMIT_MINUTES ? "over" : ""}>{formatHours(week?.minutes ?? 0, p, locale)}</strong>
          <small>{fill(p.shiftsCount, { count: week?.shifts ?? 0 })}</small>
        </div>
        <div>
          <span>
            {p.statMonth} · {formatDate(month.start, locale, { month: "long" })}
          </span>
          <strong>{formatHours(monthTotals?.minutes ?? 0, p, locale)}</strong>
          <small>{fill(p.shiftsCount, { count: monthTotals?.shifts ?? 0 })}</small>
        </div>
        <div>
          <span>{p.statUpcoming}</span>
          <strong>{upcoming.filter(occupiesTime).length}</strong>
        </div>
      </div>

      <div className="cabinet-personal-toolbar">
        <strong>{p.shiftsList}</strong>
        <div className="shift-personal-tools">
          {past.length > 0 && (
            <button type="button" className="btn btn--secondary btn--sm" aria-pressed={showPast} onClick={() => setShowPast((v) => !v)}>
              {fill(p.showPast, { count: past.length })}
            </button>
          )}
          <button type="button" className="btn btn--primary btn--sm" onClick={() => onAdd(member)}>
            {copy.opsScheduleAddBtn}
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="cabinet-swap-empty-note">{p.personalEmpty}</p>
      ) : (
        <ul className="cabinet-personal-shifts-list">
          {list.map((s) => {
            const pr = problems.get(s.id);
            const conflict = Boolean(pr && (pr.overlap.length || pr.zeroLength));
            return (
              <li key={s.id} className={`cabinet-personal-shift-row status-${s.status.toLowerCase()} ${ended(s) ? "past" : ""}`}>
                <button type="button" className="shift-personal-open" onClick={() => onInspect(s)}>
                  <strong>
                    {conflict && "⛔ "}
                    {pr?.shortRest.length && !conflict ? "⏱ " : ""}
                    {dayLabel(s.date, today, locale, copy)} · <ShiftHours start={s.start_time} end={s.end_time} />
                  </strong>
                  {s.note && <small>📍 {s.note}</small>}
                  {s.reason && <small className="reason">⚠️ {s.reason}</small>}
                </button>
                <span className={`cabinet-shift-status-badge ${s.status.toLowerCase()}`}>{statusLabel(s.status, copy)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </ShiftDialog>
  );
}
