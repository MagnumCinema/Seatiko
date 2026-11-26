"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleBadge } from "@/components/cabinet-roles";
import { useLocale } from "@/components/locale-provider";
import {
  dayLabel,
  fill,
  formatDuration,
  formatHours,
  ShiftDialog,
  ShiftHours,
  shiftWhen,
  statusIcon,
  statusLabel,
} from "@/components/shift-ui";
import { listMyStaffShifts, respondStaffShift, type Venue, type WorkShift } from "@/lib/api";
import {
  addDays,
  overlappingShifts,
  restConflicts,
  shiftSpan,
  todayInZone,
  totalsByStaff,
  weekStart,
  type ScheduleContext,
} from "@/lib/shift-schedule";
import { getSiteCopy } from "@/lib/site-copy";
import { shiftRoleLabel } from "@/lib/venue-roles";
import "@/app/cabinet/shifts.css";

/** All of a staff member's shifts are one person, across venues and memberships. */
const ME = () => "me";

/** The staff member's own schedule on /staff: answer new shifts, ask for a swap, see conflicts. */
export function StaffShiftsPanel({ venues }: { venues: Venue[] }) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const p = copy.shiftPlan;
  const presetNames = copy.roles.presets as Record<string, string>;
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [error, setError] = useState<"load" | "respond" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [showPast, setShowPast] = useState(false);
  const [swapShift, setSwapShift] = useState<WorkShift | null>(null);
  const [swapReason, setSwapReason] = useState("");
  const today = todayInZone(now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      listMyStaffShifts()
        .then((list) => {
          setShifts(list);
          setError(null);
        })
        .catch(() => setError("load"));
    });
  }, []);

  async function respond(shift: WorkShift, status: "CONFIRMED" | "DECLINED" | "SWAP_REQUESTED", reason?: string) {
    setBusyId(shift.id);
    setError(null);
    try {
      await respondStaffShift(shift.id, status, reason);
      setSwapShift(null);
      setShifts(await listMyStaffShifts());
    } catch {
      setError("respond");
    } finally {
      setBusyId(null);
    }
  }

  const sorted = useMemo(() => [...shifts].sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)), [shifts]);
  const isOver = useCallback((s: WorkShift) => (shiftSpan(s)?.end ?? 0) <= now.getTime(), [now]);
  const upcoming = sorted.filter((s) => !isOver(s));
  const past = sorted.filter(isOver).reverse();
  const pending = upcoming.filter((s) => s.status === "PENDING");
  const ctx: ScheduleContext = { personOf: ME };
  const issuesOf = (s: WorkShift) => {
    const others = { ...ctx, ignoreIds: new Set([s.id]) };
    return { overlap: overlappingShifts(s, shifts, others), rest: restConflicts(s, shifts, others) };
  };
  const week = weekStart(today);
  const weekTotals = [...totalsByStaff(shifts, week, addDays(week, 6)).values()].reduce(
    (acc, t) => ({ shifts: acc.shifts + t.shifts, minutes: acc.minutes + t.minutes }),
    { shifts: 0, minutes: 0 },
  );
  const venueName = (id: string) => {
    const v = venues.find((x) => x.id === id);
    return v ? v.name[locale] || v.name.ru || v.name.en || id : "";
  };
  const many = new Set(shifts.map((s) => s.venue_id)).size > 1;

  // Pending shifts that do not clash with a confirmed one can be accepted together.
  const acceptable = pending.filter((s) => !issuesOf(s).overlap.some((o) => o.status === "CONFIRMED"));
  async function acceptAll() {
    setBusyId("all");
    setError(null);
    try {
      // One by one, so a shift that now clashes with one just accepted is left for the person to decide.
      const done: WorkShift[] = [];
      for (const s of acceptable) {
        if (overlappingShifts(s, done, ctx).length) continue;
        await respondStaffShift(s.id, "CONFIRMED");
        done.push({ ...s, status: "CONFIRMED" });
      }
      setShifts(await listMyStaffShifts());
    } catch {
      setError("respond");
    } finally {
      setBusyId(null);
    }
  }

  const answerButtons = (shift: WorkShift, inline = false) => {
    const { overlap } = issuesOf(shift);
    // Already confirmed elsewhere at that time: confirming would promise two places at once.
    const clash = overlap.find((o) => o.status === "CONFIRMED");
    return (
      <div className={`staff-pending-shift-actions ${inline ? "inline" : ""}`}>
        <button
          type="button"
          className="panel-btn primary sm staff-shift-accept-btn"
          disabled={busyId === shift.id || busyId === "all" || Boolean(clash)}
          title={clash ? fill(p.ownOverlap, { when: shiftWhen(clash, today, locale, copy) }) : undefined}
          onClick={() => void respond(shift, "CONFIRMED")}
        >
          {copy.staffShiftsAccept}
        </button>
        <button
          type="button"
          className="panel-btn ghost sm danger staff-shift-decline-btn"
          disabled={busyId === shift.id || busyId === "all"}
          onClick={() => void respond(shift, "DECLINED")}
        >
          {copy.staffShiftsDecline}
        </button>
      </div>
    );
  };

  const issueLines = (shift: WorkShift) => {
    const { overlap, rest } = issuesOf(shift);
    return (
      <>
        {overlap.map((o) => (
          <p key={`o-${o.id}`} className="shift-card-issue">
            ⛔ {fill(p.ownOverlap, { when: `${shiftWhen(o, today, locale, copy)}${many ? ` · ${venueName(o.venue_id)}` : ""}` })}
          </p>
        ))}
        {rest.map((r) => (
          <p key={`r-${r.shift.id}`} className="shift-card-issue warn">
            ⏱ {fill(p.ownRest, { when: shiftWhen(r.shift, today, locale, copy), rest: formatDuration(r.restMinutes, p) })}
          </p>
        ))}
      </>
    );
  };

  const item = (shift: WorkShift, over: boolean) => {
    const span = shiftSpan(shift);
    return (
      <li key={shift.id} className={`cabinet-schedule-item status-${shift.status.toLowerCase()} ${over ? "past" : ""}`}>
        <div className="cabinet-schedule-item-time">
          <span className="cabinet-schedule-date-pill">{dayLabel(shift.date, today, locale, copy)}</span>
          <strong className="cabinet-schedule-hours">
            <ShiftHours start={shift.start_time} end={shift.end_time} />
          </strong>
          {span && <small className="staff-shift-length">{formatDuration(span.minutes, p)}</small>}
        </div>
        <div className="cabinet-schedule-item-staff">
          <div>
            <div className="cabinet-schedule-staff-name-row">
              <RoleBadge label={shiftRoleLabel(shift, presetNames)} color={shift.role_color} />
              {venueName(shift.venue_id) && <span className="staff-shift-venue">{venueName(shift.venue_id)}</span>}
            </div>
            {shift.note && (
              <p className="cabinet-schedule-item-note">
                <span>📍</span> {shift.note}
              </p>
            )}
            {!over && issueLines(shift)}
          </div>
        </div>
        <div className="cabinet-schedule-item-right">
          <span className={`cabinet-shift-status-badge ${shift.status.toLowerCase()}`}>
            <span className="shift-badge-icon">{statusIcon(shift.status)}</span> {statusLabel(shift.status, copy)}
          </span>
          {!over && shift.status === "CONFIRMED" && (
            <button
              type="button"
              className="panel-btn ghost sm danger"
              onClick={() => {
                setSwapShift(shift);
                setSwapReason("");
              }}
            >
              ⚠ {copy.staffSwapRequestBtn}
            </button>
          )}
          {!over && shift.status === "PENDING" && answerButtons(shift, true)}
        </div>
      </li>
    );
  };

  return (
    <>
      {error && (
        <div className="owner-notice error" role="alert">
          <span aria-hidden="true">!</span>
          <p>{error === "load" ? p.loadError : p.respondError}</p>
        </div>
      )}

      {pending.length > 0 && (
        <section className="owner-card staff-shifts-alert-card" role="status">
          <div className="staff-shifts-alert-icon" aria-hidden="true">
            🔔
          </div>
          <div className="staff-shifts-alert-content">
            <div className="staff-shifts-alert-head">
              <h4>{copy.staffShiftsPendingAlert}</h4>
              {acceptable.length > 1 && (
                <button type="button" className="panel-btn primary sm" disabled={busyId !== null} onClick={() => void acceptAll()}>
                  {fill(p.acceptAll, { count: acceptable.length })}
                </button>
              )}
            </div>
            <div className="staff-pending-shifts-list">
              {pending.map((shift) => (
                <div key={shift.id} className="staff-pending-shift-row">
                  <div className="staff-pending-shift-info">
                    <strong className="staff-pending-shift-time">
                      {dayLabel(shift.date, today, locale, copy)} · <ShiftHours start={shift.start_time} end={shift.end_time} />
                    </strong>
                    <RoleBadge label={shiftRoleLabel(shift, presetNames)} color={shift.role_color} />
                    {many && <span className="staff-shift-venue">{venueName(shift.venue_id)}</span>}
                    {shift.note && <span className="staff-pending-shift-note">📍 {shift.note}</span>}
                    {issueLines(shift)}
                  </div>
                  {answerButtons(shift)}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="owner-card staff-shifts-section">
        <div className="owner-card-head">
          <div>
            <span className="owner-kicker">{p.myShifts}</span>
            <h3>{copy.staffShiftsTitle}</h3>
            {weekTotals.shifts > 0 && <p className="cabinet-ops-sub">{fill(p.myWeek, { count: weekTotals.shifts, hours: formatHours(weekTotals.minutes, p, locale) })}</p>}
          </div>
          {past.length > 0 && (
            <button type="button" className="panel-btn ghost sm" aria-pressed={showPast} onClick={() => setShowPast((v) => !v)}>
              {fill(p.pastShifts, { count: past.length })}
            </button>
          )}
        </div>

        {upcoming.length === 0 && !showPast ? (
          <p className="cabinet-ops-empty">{copy.staffShiftsEmpty}</p>
        ) : (
          <ul className="cabinet-schedule-list">{upcoming.map((s) => item(s, false))}</ul>
        )}
        {showPast && past.length > 0 && <ul className="cabinet-schedule-list staff-past-list">{past.map((s) => item(s, true))}</ul>}
      </section>

      {swapShift && (
        <ShiftDialog
          open
          onClose={() => setSwapShift(null)}
          title={copy.staffSwapModalTitle}
          sub={`${dayLabel(swapShift.date, today, locale, copy)} · ${swapShift.start_time}–${swapShift.end_time}`}
          closeLabel={copy.opsMenuCancel}
        >
          <form
            className="cabinet-shift-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (swapReason.trim()) void respond(swapShift, "SWAP_REQUESTED", swapReason.trim());
            }}
          >
            <div className="cabinet-shift-field-group">
              <label htmlFor="staff-swap-reason-input">{p.reason}</label>
              <textarea
                id="staff-swap-reason-input"
                required
                rows={3}
                value={swapReason}
                onChange={(e) => setSwapReason(e.target.value)}
                placeholder={copy.staffSwapReasonPlaceholder}
                className="cabinet-shift-input staff-swap-reason"
              />
            </div>
            <div className="cabinet-shift-actions">
              <button type="submit" className="panel-btn primary danger" disabled={!swapReason.trim() || busyId === swapShift.id}>
                {copy.staffSwapSendBtn}
              </button>
              <button type="button" className="panel-btn ghost" onClick={() => setSwapShift(null)}>
                {copy.opsMenuCancel}
              </button>
            </div>
          </form>
        </ShiftDialog>
      )}
    </>
  );
}
