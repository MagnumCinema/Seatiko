"use client";

import { useCallback, useMemo, useState } from "react";
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
import { StaffEmpty } from "@/components/staff-live";
import { respondStaffShift, type WorkShift } from "@/lib/api";
import { pluralize } from "@/lib/cabinet-helpers";
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

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/**
 * The staff member's own schedule: answer new shifts (one by one or all at once), ask for a swap,
 * see clashes with their other shifts and short rest. The page loads the shifts (the sidebar and
 * the tab badge need them too) and reloads them after each answer.
 */
export function StaffShiftsPanel({
  venueName,
  shifts,
  failed,
  now,
  onReload,
}: {
  venueName: (id: string) => string;
  shifts: WorkShift[];
  failed: boolean;
  now: number;
  onReload: () => Promise<void>;
}) {
  const { locale } = useLocale();
  const site = getSiteCopy(locale);
  const copy = site.cabinet;
  const p = copy.shiftPlan;
  const s = site.staff.shifts;
  const presetNames = copy.roles.presets as Record<string, string>;
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [swapShift, setSwapShift] = useState<WorkShift | null>(null);
  const [swapReason, setSwapReason] = useState("");
  const today = todayInZone(new Date(now));

  async function respond(shift: WorkShift, status: "CONFIRMED" | "DECLINED" | "SWAP_REQUESTED", reason?: string) {
    setBusyId(shift.id);
    setError(false);
    try {
      await respondStaffShift(shift.id, status, reason);
      setSwapShift(null);
    } catch {
      setError(true);
    } finally {
      await onReload();
      setBusyId(null);
    }
  }

  const sorted = useMemo(() => [...shifts].sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)), [shifts]);
  const isOver = useCallback((x: WorkShift) => (shiftSpan(x)?.end ?? 0) <= now, [now]);
  const isNow = (x: WorkShift) => {
    const span = shiftSpan(x);
    return Boolean(span && span.start <= now && now < span.end && x.status !== "DECLINED");
  };
  const upcoming = sorted.filter((x) => !isOver(x));
  const past = sorted.filter(isOver).reverse();
  const pending = upcoming.filter((x) => x.status === "PENDING");
  const ctx: ScheduleContext = { personOf: ME };
  const issuesOf = (x: WorkShift) => {
    const others = { ...ctx, ignoreIds: new Set([x.id]) };
    return { overlap: overlappingShifts(x, shifts, others), rest: restConflicts(x, shifts, others) };
  };
  const week = weekStart(today);
  const weekTotals = [...totalsByStaff(shifts, week, addDays(week, 6)).values()].reduce(
    (acc, t) => ({ shifts: acc.shifts + t.shifts, minutes: acc.minutes + t.minutes }),
    { shifts: 0, minutes: 0 },
  );
  const many = new Set(shifts.map((x) => x.venue_id)).size > 1;

  // Pending shifts that do not clash with a confirmed one can be accepted together.
  const acceptable = pending.filter((x) => !issuesOf(x).overlap.some((o) => o.status === "CONFIRMED"));
  async function acceptAll() {
    setBusyId("all");
    setError(false);
    try {
      // One by one, so a shift that now clashes with one just accepted is left for the person to decide.
      const done: WorkShift[] = [];
      for (const x of acceptable) {
        if (overlappingShifts(x, done, ctx).length) continue;
        await respondStaffShift(x.id, "CONFIRMED");
        done.push({ ...x, status: "CONFIRMED" });
      }
    } catch {
      setError(true);
    } finally {
      await onReload();
      setBusyId(null);
    }
  }

  const answerButtons = (shift: WorkShift) => {
    const { overlap } = issuesOf(shift);
    // Already confirmed elsewhere at that time: confirming would promise two places at once.
    const clash = overlap.find((o) => o.status === "CONFIRMED");
    return (
      <div className="staff-pending-shift-actions inline">
        <button
          type="button"
          className="btn btn--primary btn--sm staff-shift-accept-btn"
          disabled={busyId !== null || Boolean(clash)}
          title={clash ? fill(p.ownOverlap, { when: shiftWhen(clash, today, locale, copy) }) : undefined}
          onClick={() => void respond(shift, "CONFIRMED")}
        >
          {copy.staffShiftsAccept}
        </button>
        <button
          type="button"
          className="btn btn--danger-outline btn--sm staff-shift-decline-btn"
          disabled={busyId !== null}
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
    const running = !over && isNow(shift);
    return (
      <li key={shift.id} className={`cabinet-schedule-item status-${shift.status.toLowerCase()} ${over ? "past" : ""} ${running ? "is-now" : ""}`}>
        <div className="cabinet-schedule-item-time">
          <span className="cabinet-schedule-date-pill">{running ? s.now : dayLabel(shift.date, today, locale, copy)}</span>
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
                <span aria-hidden="true">📍</span> {shift.note}
              </p>
            )}
            {shift.status === "SWAP_REQUESTED" && shift.reason && <p className="cabinet-schedule-item-note">{shift.reason}</p>}
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
              className="btn btn--danger-outline btn--sm"
              disabled={busyId !== null}
              onClick={() => {
                setSwapShift(shift);
                setSwapReason("");
              }}
            >
              {s.swap}
            </button>
          )}
          {!over && shift.status === "PENDING" && answerButtons(shift)}
        </div>
      </li>
    );
  };

  return (
    <div className="sf-stack">
      {(error || failed) && (
        <div className="owner-notice error" role="alert">
          <span aria-hidden="true">!</span>
          <p>{error ? p.respondError : p.loadError}</p>
        </div>
      )}

      {pending.length > 0 && (
        <section className="owner-card staff-shifts-alert-card" role="status">
          <div className="staff-shifts-alert-icon" aria-hidden="true">
            🔔
          </div>
          <div className="staff-shifts-alert-content">
            <div className="staff-shifts-alert-head">
              <div>
                <h4>{fill(s.pendingTitle, { n: pending.length })}</h4>
                <p className="sf-hint">{s.pendingHint}</p>
              </div>
              {acceptable.length > 1 && (
                <button type="button" className="btn btn--primary btn--sm" disabled={busyId !== null} onClick={() => void acceptAll()}>
                  {fill(p.acceptAll, { count: acceptable.length })}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="owner-card staff-shifts-section">
        <div className="owner-card-head sf-shifts-head">
          <p className="cabinet-ops-sub">
            {weekTotals.shifts > 0
              ? fill(s.week, {
                  shifts: `${weekTotals.shifts} ${pluralize(weekTotals.shifts, s.shiftsForms, locale)}`,
                  hours: formatHours(weekTotals.minutes, p, locale),
                })
              : copy.staffShiftsTitle}
          </p>
          {past.length > 0 && (
            <button type="button" className="btn btn--secondary btn--sm" aria-pressed={showPast} onClick={() => setShowPast((v) => !v)}>
              {fill(p.pastShifts, { count: past.length })}
            </button>
          )}
        </div>

        {upcoming.length === 0 && !showPast ? (
          <StaffEmpty icon={<CalendarIcon />} title={copy.staffShiftsEmpty} hint={s.emptyHint} />
        ) : (
          <ul className="cabinet-schedule-list">{upcoming.map((x) => item(x, false))}</ul>
        )}
        {showPast && past.length > 0 && <ul className="cabinet-schedule-list staff-past-list">{past.map((x) => item(x, true))}</ul>}
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
                maxLength={300}
                value={swapReason}
                onChange={(e) => setSwapReason(e.target.value)}
                placeholder={copy.staffSwapReasonPlaceholder}
                className="cabinet-shift-input staff-swap-reason"
              />
            </div>
            <div className="cabinet-shift-actions">
              <button type="submit" className="btn btn--danger btn--md" disabled={!swapReason.trim() || busyId === swapShift.id}>
                {copy.staffSwapSendBtn}
              </button>
              <button type="button" className="btn btn--ghost btn--md" onClick={() => setSwapShift(null)}>
                {copy.opsMenuCancel}
              </button>
            </div>
          </form>
        </ShiftDialog>
      )}
    </div>
  );
}
