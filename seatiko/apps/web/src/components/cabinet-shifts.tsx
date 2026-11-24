"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/locale-provider";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { getSiteCopy } from "@/lib/site-copy";
import {
  ApiError,
  batchCreateVenueWorkShifts,
  deleteVenueWorkShift,
  listVenueStaff,
  listVenueWorkShifts,
  swapVenueWorkShiftStaff,
  type StaffMember,
  type WorkShift,
} from "@/lib/api";

type Props = { venueId: string };

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function calcShiftDuration(start: string, end: string, locale: "ru" | "ro" | "en"): string {
  const [sh, sm] = (start || "").split(":").map(Number);
  const [eh, em] = (end || "").split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return "";
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  const hUnit = locale === "ro" ? "ore" : locale === "en" ? "h" : "ч";
  const mUnit = locale === "ro" ? "min" : locale === "en" ? "m" : "мин";
  if (remMin === 0) return `${hrs} ${hUnit}`;
  return `${hrs} ${hUnit} ${remMin} ${mUnit}`;
}

function parseTimeMinutes(hhmm: string): number | null {
  const parts = (hhmm || "").trim().split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function shiftsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const s1 = parseTimeMinutes(startA);
  let e1 = parseTimeMinutes(endA);
  const s2 = parseTimeMinutes(startB);
  let e2 = parseTimeMinutes(endB);
  if (s1 === null || e1 === null || s2 === null || e2 === null) return true;
  if (e1 <= s1) e1 += 24 * 60;
  if (e2 <= s2) e2 += 24 * 60;
  return s1 < e2 && s2 < e1;
}

function findShiftConflict(
  shifts: WorkShift[],
  staffId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeShiftId?: string,
): WorkShift | undefined {
  return shifts.find(
    (s) =>
      s.id !== excludeShiftId &&
      s.staff_id === staffId &&
      s.date === date &&
      (s.status === "CONFIRMED" || s.status === "PENDING") &&
      shiftsOverlap(startTime, endTime, s.start_time, s.end_time),
  );
}

function formatConflictLabel(conflict: WorkShift, locale: "ru" | "ro" | "en"): string {
  const time = `${conflict.start_time}–${conflict.end_time}`;
  if (conflict.status === "CONFIRMED") {
    return locale === "ro"
      ? `Programat (${time})`
      : locale === "en"
      ? `Assigned (${time})`
      : `Назначен (${time})`;
  }
  return locale === "ro"
    ? `În așteptare (${time})`
    : locale === "en"
    ? `Pending (${time})`
    : `В ожидании (${time})`;
}

export function CabinetShiftsPlanner({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Calendar navigation state
  const todayStr = useMemo(() => toDateString(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [weekOffset, setWeekOffset] = useState(0);

  // Modals state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [swappingShift, setSwappingShift] = useState<WorkShift | null>(null);
  const [deletingShift, setDeletingShift] = useState<WorkShift | null>(null);

  const batchModalRef = useRef<HTMLElement>(null);
  const recurringModalRef = useRef<HTMLElement>(null);
  const swapModalRef = useRef<HTMLElement>(null);
  const deleteModalRef = useRef<HTMLElement>(null);

  useDialogFocus(isBatchModalOpen, batchModalRef, () => setIsBatchModalOpen(false));
  useDialogFocus(isRecurringModalOpen, recurringModalRef, () => setIsRecurringModalOpen(false));
  useDialogFocus(!!swappingShift, swapModalRef, () => setSwappingShift(null));
  useDialogFocus(!!deletingShift, deleteModalRef, () => setDeletingShift(null));

  useEffect(() => {
    if (!isBatchModalOpen && !isRecurringModalOpen && !swappingShift && !deletingShift) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isBatchModalOpen, isRecurringModalOpen, swappingShift, deletingShift]);

  // Batch Form State
  const [batchDate, setBatchDate] = useState(selectedDate);
  const [batchStart, setBatchStart] = useState("10:00");
  const [batchEnd, setBatchEnd] = useState("22:00");
  const [batchWaiters, setBatchWaiters] = useState<string[]>([]);
  const [batchCooks, setBatchCooks] = useState<string[]>([]);
  const [batchNote, setBatchNote] = useState("");

  // Recurring Form State
  const [recurringPattern, setRecurringPattern] = useState<"2/2" | "weekdays">("2/2");
  const [recurringStartDate, setRecurringStartDate] = useState(selectedDate);
  const [recurringPeriodWeeks, setRecurringPeriodWeeks] = useState<number>(2);
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([1, 2, 3, 4, 5]); // 1=Mon .. 7=Sun
  const [recurringStaffIds, setRecurringStaffIds] = useState<string[]>([]);
  const [recurringStart, setRecurringStart] = useState("10:00");
  const [recurringEnd, setRecurringEnd] = useState("22:00");
  const [recurringNote, setRecurringNote] = useState("");

  // Swap Form State
  const [replacementStaffId, setReplacementStaffId] = useState("");

  async function reload() {
    const [staffList, shiftsList] = await Promise.all([
      listVenueStaff(venueId),
      listVenueWorkShifts(venueId),
    ]);
    setStaff(staffList);
    setShifts(shiftsList);
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBusy(true);
      reload()
        .catch(() => {
          if (!cancelled) setMessage({ type: "error", text: locale === "ro" ? "Eroare la încărcare" : "Ошибка загрузки" });
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await reload();
      setMessage({ type: "success", text: ok });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMessage({
          type: "error",
          text:
            locale === "ro"
              ? "Conflict de program: angajatul este deja programat la această oră"
              : locale === "en"
              ? "Schedule conflict: staff member already has a shift at this time"
              : "Конфликт расписания: сотрудник уже назначен или ожидает подтверждения на это время",
        });
      } else {
        setMessage({
          type: "error",
          text: locale === "ro" ? "Eroare de operare" : locale === "en" ? "Operation error" : "Ошибка операции",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  // Week days calculation
  const weekDays = useMemo(() => {
    const monday = getMonday(new Date());
    monday.setDate(monday.getDate() + weekOffset * 7);
    const days: { date: string; dayNum: number; dayName: string; isToday: boolean; isSelected: boolean }[] = [];
    const lang = locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU";

    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      const str = toDateString(cur);
      const dayName = cur.toLocaleDateString(lang, { weekday: "short" });
      days.push({
        date: str,
        dayNum: cur.getDate(),
        dayName: dayName.toUpperCase(),
        isToday: str === todayStr,
        isSelected: str === selectedDate,
      });
    }
    return days;
  }, [weekOffset, locale, todayStr, selectedDate]);

  // Shifts for selected date
  const dayShifts = useMemo(() => {
    return shifts.filter((s) => s.date === selectedDate);
  }, [shifts, selectedDate]);

  const dayWaiters = useMemo(() => {
    return dayShifts.filter((s) => (s.role || "waiter") === "waiter");
  }, [dayShifts]);

  const dayCooks = useMemo(() => {
    return dayShifts.filter((s) => s.role === "cook");
  }, [dayShifts]);

  // Shifts on this day with alert (swap requested or declined)
  const alertedDayShifts = useMemo(() => {
    return dayShifts.filter((s) => s.status === "SWAP_REQUESTED" || s.status === "DECLINED");
  }, [dayShifts]);

  const waiters = useMemo(() => staff.filter((m) => (m.role || "waiter") === "waiter"), [staff]);
  const cooks = useMemo(() => staff.filter((m) => m.role === "cook"), [staff]);

  // Valid (non-conflicting) selections for Batch Modal
  const validBatchWaiters = useMemo(
    () => batchWaiters.filter((id) => !findShiftConflict(shifts, id, batchDate, batchStart, batchEnd)),
    [batchWaiters, shifts, batchDate, batchStart, batchEnd],
  );
  const validBatchCooks = useMemo(
    () => batchCooks.filter((id) => !findShiftConflict(shifts, id, batchDate, batchStart, batchEnd)),
    [batchCooks, shifts, batchDate, batchStart, batchEnd],
  );

  // Recurring preview dates & conflict counts
  const recurringDates = useMemo(() => {
    const dates: string[] = [];
    if (!recurringStartDate) return dates;
    const start = new Date(recurringStartDate + "T00:00:00");
    if (isNaN(start.getTime())) return dates;
    const totalDays = recurringPeriodWeeks * 7;

    for (let i = 0; i < totalDays; i++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      const curStr = toDateString(cur);
      if (recurringPattern === "2/2") {
        if (i % 4 === 0 || i % 4 === 1) {
          dates.push(curStr);
        }
      } else {
        const dayOfWeek = cur.getDay() === 0 ? 7 : cur.getDay();
        if (recurringWeekdays.includes(dayOfWeek)) {
          dates.push(curStr);
        }
      }
    }
    return dates;
  }, [recurringStartDate, recurringPeriodWeeks, recurringPattern, recurringWeekdays]);

  const recurringSummary = useMemo(() => {
    let availableSlots = 0;
    let conflictSlots = 0;
    for (const staffId of recurringStaffIds) {
      for (const d of recurringDates) {
        if (findShiftConflict(shifts, staffId, d, recurringStart, recurringEnd)) {
          conflictSlots++;
        } else {
          availableSlots++;
        }
      }
    }
    return { availableSlots, conflictSlots };
  }, [recurringStaffIds, recurringDates, shifts, recurringStart, recurringEnd]);

  // Candidates for Swap Modal (sorted: free first, busy disabled below)
  const swapCandidates = useMemo(() => {
    if (!swappingShift) return [];
    const role = swappingShift.role || "waiter";
    return staff
      .filter((m) => (m.role || "waiter") === role && m.id !== swappingShift.staff_id)
      .map((m) => ({
        member: m,
        conflict: findShiftConflict(
          shifts,
          m.id,
          swappingShift.date,
          swappingShift.start_time,
          swappingShift.end_time,
          swappingShift.id,
        ),
      }))
      .sort((a, b) => Number(Boolean(a.conflict)) - Number(Boolean(b.conflict)));
  }, [swappingShift, staff, shifts]);

  // Helper to open Batch Modal for current day
  function openBatchModal() {
    setBatchDate(selectedDate);
    setBatchWaiters(
      waiters
        .filter((w) => !findShiftConflict(shifts, w.id, selectedDate, batchStart, batchEnd))
        .map((w) => w.id),
    );
    setBatchCooks(
      cooks
        .filter((c) => !findShiftConflict(shifts, c.id, selectedDate, batchStart, batchEnd))
        .map((c) => c.id),
    );
    setBatchNote("");
    setIsBatchModalOpen(true);
  }

  // Helper to open Recurring Modal
  function openRecurringModal() {
    setRecurringStartDate(selectedDate);
    setRecurringStaffIds(staff.map((s) => s.id));
    setRecurringNote("");
    setIsRecurringModalOpen(true);
  }

  // Helper to open Swap Modal
  function openSwapModal(shift: WorkShift) {
    setSwappingShift(shift);
    const role = shift.role || "waiter";
    const freeCandidate = staff.find(
      (m) =>
        (m.role || "waiter") === role &&
        m.id !== shift.staff_id &&
        !findShiftConflict(shifts, m.id, shift.date, shift.start_time, shift.end_time, shift.id),
    );
    setReplacementStaffId(freeCandidate?.id || "");
  }

  // Submit Batch Modal
  async function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allSelectedStaff = [...validBatchWaiters, ...validBatchCooks];
    if (allSelectedStaff.length === 0) return;

    await run(async () => {
      await batchCreateVenueWorkShifts(venueId, {
        staff_ids: allSelectedStaff,
        dates: [batchDate],
        start_time: batchStart,
        end_time: batchEnd,
        note: batchNote.trim() || undefined,
      });
      setIsBatchModalOpen(false);
    }, locale === "ro"
      ? `${allSelectedStaff.length} ture programate pentru ${batchDate}`
      : locale === "en"
      ? `${allSelectedStaff.length} shifts assigned for ${batchDate}`
      : `Назначено смен: ${allSelectedStaff.length} на ${batchDate}`);
  }

  // Submit Recurring Modal
  async function handleRecurringSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (recurringStaffIds.length === 0 || recurringDates.length === 0 || recurringSummary.availableSlots === 0) return;

    await run(async () => {
      const created = await batchCreateVenueWorkShifts(venueId, {
        staff_ids: recurringStaffIds,
        dates: recurringDates,
        start_time: recurringStart,
        end_time: recurringEnd,
        note: recurringNote.trim() || undefined,
      });
      setIsRecurringModalOpen(false);
      void created;
    }, locale === "ro"
      ? `Program stabil generat: ${recurringSummary.availableSlots} ture`
      : locale === "en"
      ? `Recurring schedule generated: ${recurringSummary.availableSlots} shifts`
      : `Сгенерирован стабильный график: ${recurringSummary.availableSlots} смен`);
  }

  // Submit Swap Modal
  async function handleSwapSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!swappingShift || !replacementStaffId) return;

    await run(async () => {
      await swapVenueWorkShiftStaff(venueId, swappingShift.id, replacementStaffId);
      setSwappingShift(null);
    }, locale === "ro" ? "Înlocuirea a fost confirmată" : locale === "en" ? "Replacement confirmed" : "Сотрудник на смене успешно заменён");
  }

  async function handleConfirmDeleteShift() {
    if (!deletingShift) return;
    const shiftToDelete = deletingShift;
    await run(async () => {
      await deleteVenueWorkShift(venueId, shiftToDelete.id);
      setDeletingShift(null);
    }, locale === "ro" ? "Tura a fost ștearsă" : locale === "en" ? "Shift deleted" : "Смена удалена");
  }

  // Format selected day label
  const formattedDayTitle = useMemo(() => {
    try {
      const d = new Date(selectedDate + "T00:00:00");
      const lang = locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU";
      return d.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch {
      return selectedDate;
    }
  }, [selectedDate, locale]);

  return (
    <div className="cabinet-ops cabinet-shifts-planner">
      {message && (
        <div className={`owner-notice ${message.type}`} role="alert">
          <span>{message.type === "error" ? "!" : "✓"}</span>
          <p>{message.text}</p>
        </div>
      )}
      {busy && (
        <p className="fa-muted">
          {locale === "ro" ? "Se încarcă…" : locale === "en" ? "Loading…" : "Загрузка…"}
        </p>
      )}

      {/* Main Planner Card */}
      <section className="owner-card cabinet-ops-card cabinet-planner-card">
        {/* Header with Title and Global Actions */}
        <div className="owner-card-head cabinet-planner-head">
          <div>
            <span className="owner-kicker">{copy.shifts}</span>
            <h3>{copy.plannerTitle}</h3>
            <p className="cabinet-ops-sub">{copy.shiftsSubtitle}</p>
          </div>
          <div className="cabinet-planner-head-actions">
            <button
              type="button"
              className="panel-btn primary cabinet-planner-add-btn"
              onClick={openBatchModal}
            >
              {copy.plannerAssignForDay}
            </button>
            <button
              type="button"
              className="panel-btn ghost cabinet-planner-recurring-btn"
              onClick={openRecurringModal}
            >
              📅 {copy.plannerRecurringSchedule}
            </button>
          </div>
        </div>

        {/* Week Navigator & Days Strip */}
        <div className="cabinet-planner-week-strip">
          <div className="cabinet-planner-nav-bar">
            <button
              type="button"
              className="cabinet-planner-nav-arrow"
              onClick={() => setWeekOffset((w) => w - 1)}
              title={copy.plannerPrevWeek}
            >
              ‹
            </button>
            <button
              type="button"
              className={`cabinet-planner-nav-today ${weekOffset === 0 ? "active" : ""}`}
              onClick={() => {
                setWeekOffset(0);
                setSelectedDate(todayStr);
              }}
            >
              {copy.plannerToday}
            </button>
            <button
              type="button"
              className="cabinet-planner-nav-arrow"
              onClick={() => setWeekOffset((w) => w + 1)}
              title={copy.plannerNextWeek}
            >
              ›
            </button>
          </div>

          <div className="cabinet-planner-days-grid" role="tablist">
            {weekDays.map((d) => {
              const countWaiters = shifts.filter((s) => s.date === d.date && (s.role || "waiter") === "waiter").length;
              const countCooks = shifts.filter((s) => s.date === d.date && s.role === "cook").length;
              const hasAlert = shifts.some(
                (s) => s.date === d.date && (s.status === "SWAP_REQUESTED" || s.status === "DECLINED")
              );

              return (
                <button
                  key={d.date}
                  type="button"
                  role="tab"
                  aria-selected={d.isSelected}
                  className={`cabinet-planner-day-pill ${d.isSelected ? "active" : ""} ${d.isToday ? "today" : ""}`}
                  onClick={() => setSelectedDate(d.date)}
                >
                  <span className="cabinet-planner-day-name">{d.dayName}</span>
                  <strong className="cabinet-planner-day-num">{d.dayNum}</strong>
                  <div className="cabinet-planner-day-counts">
                    {countWaiters > 0 && (
                      <span className="cabinet-planner-badge-waiter" title={`${countWaiters} ${copy.plannerWaiters}`}>
                        👤 {countWaiters}
                      </span>
                    )}
                    {countCooks > 0 && (
                      <span className="cabinet-planner-badge-cook" title={`${countCooks} ${copy.plannerCooks}`}>
                        👨‍🍳 {countCooks}
                      </span>
                    )}
                    {countWaiters === 0 && countCooks === 0 && (
                      <span className="cabinet-planner-badge-empty">—</span>
                    )}
                  </div>
                  {hasAlert && (
                    <span className="cabinet-planner-day-alert-dot" title={copy.plannerSwapRequestAlert} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day View Header & Summary */}
        <div className="cabinet-planner-day-header">
          <div>
            <h4 className="cabinet-planner-day-title">{formattedDayTitle}</h4>
            <span className="cabinet-planner-day-summary">
              {locale === "ro"
                ? `În tură: ${dayWaiters.length} ospătari · ${dayCooks.length} bucătari`
                : locale === "en"
                ? `On shift: ${dayWaiters.length} waiters · ${dayCooks.length} cooks`
                : `На смене: ${dayWaiters.length} официантов · ${dayCooks.length} поваров`}
            </span>
          </div>

          <button
            type="button"
            className="panel-btn primary sm"
            onClick={openBatchModal}
          >
            + {copy.opsScheduleAddBtn}
          </button>
        </div>

        {/* Swap / Absence Alerts Banner */}
        {alertedDayShifts.length > 0 && (
          <div className="cabinet-planner-swap-banner" role="alert">
            <span className="cabinet-planner-swap-icon" aria-hidden="true">
              ⚠️
            </span>
            <div className="cabinet-planner-swap-info">
              <strong>{copy.plannerSwapRequestAlert}</strong>
              {alertedDayShifts.map((shift) => (
                <div key={shift.id} className="cabinet-planner-swap-row">
                  <div>
                    <span className="cabinet-planner-swap-name">{shift.staff_name}</span>
                    <span className={`cabinet-staff-role-tag role-${shift.role || "waiter"}`}>
                      {shift.role === "cook" ? copy.opsStaffRoleCook : copy.opsStaffRoleWaiter}
                    </span>
                    <span className="cabinet-planner-swap-hours">
                      ({shift.start_time} – {shift.end_time})
                    </span>
                    {shift.reason && (
                      <span className="cabinet-planner-swap-reason">
                        — «{shift.reason}»
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="panel-btn primary sm cabinet-planner-swap-action-btn"
                    onClick={() => openSwapModal(shift)}
                  >
                    ⇄ {copy.plannerSwapBtn}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Two Columns: Waitstaff & Cooks */}
        <div className="cabinet-planner-columns">
          {/* Waiters Column */}
          <div className="cabinet-planner-col">
            <div className="cabinet-planner-col-head">
              <div className="cabinet-planner-col-title-wrap">
                <span className="cabinet-staff-role-tag role-waiter">👤</span>
                <h5>{copy.plannerWaiters} ({dayWaiters.length})</h5>
              </div>
            </div>

            {dayWaiters.length === 0 ? (
              <div className="cabinet-planner-col-empty">
                <p>{locale === "ro" ? "Niciun ospătar pe această tură" : locale === "en" ? "No waiters on this shift" : "Официанты на эту смену не назначены"}</p>
                <button
                  type="button"
                  className="panel-btn ghost sm"
                  onClick={openBatchModal}
                >
                  + {copy.plannerAssignForDay}
                </button>
              </div>
            ) : (
              <ul className="cabinet-planner-cards-list">
                {dayWaiters.map((shift) => {
                  const duration = calcShiftDuration(shift.start_time, shift.end_time, locale);
                  const isAlert = shift.status === "SWAP_REQUESTED" || shift.status === "DECLINED";

                  return (
                    <li key={shift.id} className={`cabinet-planner-shift-card ${isAlert ? "alert" : ""}`}>
                      <div className="cabinet-planner-card-top">
                        <div className="cabinet-planner-card-staff">
                          <span className="cabinet-staff-avatar sm" aria-hidden="true">
                            {shift.staff_name.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <strong className="cabinet-planner-card-name">{shift.staff_name}</strong>
                            <span className="cabinet-planner-card-hours">
                              {shift.start_time} – {shift.end_time} {duration && <small>({duration})</small>}
                            </span>
                          </div>
                        </div>

                        <span className={`cabinet-shift-status-badge ${shift.status.toLowerCase()}`}>
                          {shift.status === "CONFIRMED" && "✓ "}
                          {shift.status === "PENDING" && "⏳ "}
                          {shift.status === "SWAP_REQUESTED" && "⚠️ "}
                          {shift.status === "DECLINED" && "✕ "}
                          {shift.status === "CONFIRMED"
                            ? copy.opsScheduleConfirmed
                            : shift.status === "SWAP_REQUESTED"
                            ? copy.staffSwapStatusBadge
                            : shift.status === "DECLINED"
                            ? copy.opsScheduleDeclined
                            : copy.opsSchedulePending}
                        </span>
                      </div>

                      {shift.note && (
                        <p className="cabinet-planner-card-note">📍 {shift.note}</p>
                      )}

                      {shift.reason && (
                        <div className="cabinet-planner-card-reason">
                          <strong>{locale === "ro" ? "Motiv refuz/înlocuire:" : locale === "en" ? "Swap reason:" : "Причина отсутствия:"}</strong>
                          <p>{shift.reason}</p>
                        </div>
                      )}

                      <div className="cabinet-planner-card-actions">
                        <button
                          type="button"
                          className="panel-btn ghost sm"
                          onClick={() => openSwapModal(shift)}
                          title={copy.plannerSwapBtn}
                        >
                          ⇄ {copy.plannerSwapBtn}
                        </button>
                        <button
                          type="button"
                          className="panel-btn ghost sm danger"
                          onClick={() => setDeletingShift(shift)}
                          title={copy.opsScheduleDeleteBtn}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Cooks Column */}
          <div className="cabinet-planner-col">
            <div className="cabinet-planner-col-head">
              <div className="cabinet-planner-col-title-wrap">
                <span className="cabinet-staff-role-tag role-cook">👨‍🍳</span>
                <h5>{copy.plannerCooks} ({dayCooks.length})</h5>
              </div>
            </div>

            {dayCooks.length === 0 ? (
              <div className="cabinet-planner-col-empty">
                <p>{locale === "ro" ? "Niciun bucătar pe această tură" : locale === "en" ? "No cooks on this shift" : "Повара на эту смену не назначены"}</p>
                <button
                  type="button"
                  className="panel-btn ghost sm"
                  onClick={openBatchModal}
                >
                  + {copy.plannerAssignForDay}
                </button>
              </div>
            ) : (
              <ul className="cabinet-planner-cards-list">
                {dayCooks.map((shift) => {
                  const duration = calcShiftDuration(shift.start_time, shift.end_time, locale);
                  const isAlert = shift.status === "SWAP_REQUESTED" || shift.status === "DECLINED";

                  return (
                    <li key={shift.id} className={`cabinet-planner-shift-card ${isAlert ? "alert" : ""}`}>
                      <div className="cabinet-planner-card-top">
                        <div className="cabinet-planner-card-staff">
                          <span className="cabinet-staff-avatar sm" aria-hidden="true">
                            {shift.staff_name.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <strong className="cabinet-planner-card-name">{shift.staff_name}</strong>
                            <span className="cabinet-planner-card-hours">
                              {shift.start_time} – {shift.end_time} {duration && <small>({duration})</small>}
                            </span>
                          </div>
                        </div>

                        <span className={`cabinet-shift-status-badge ${shift.status.toLowerCase()}`}>
                          {shift.status === "CONFIRMED" && "✓ "}
                          {shift.status === "PENDING" && "⏳ "}
                          {shift.status === "SWAP_REQUESTED" && "⚠️ "}
                          {shift.status === "DECLINED" && "✕ "}
                          {shift.status === "CONFIRMED"
                            ? copy.opsScheduleConfirmed
                            : shift.status === "SWAP_REQUESTED"
                            ? copy.staffSwapStatusBadge
                            : shift.status === "DECLINED"
                            ? copy.opsScheduleDeclined
                            : copy.opsSchedulePending}
                        </span>
                      </div>

                      {shift.note && (
                        <p className="cabinet-planner-card-note">📍 {shift.note}</p>
                      )}

                      {shift.reason && (
                        <div className="cabinet-planner-card-reason">
                          <strong>{locale === "ro" ? "Motiv refuz/înlocuire:" : locale === "en" ? "Swap reason:" : "Причина отсутствия:"}</strong>
                          <p>{shift.reason}</p>
                        </div>
                      )}

                      <div className="cabinet-planner-card-actions">
                        <button
                          type="button"
                          className="panel-btn ghost sm"
                          onClick={() => openSwapModal(shift)}
                          title={copy.plannerSwapBtn}
                        >
                          ⇄ {copy.plannerSwapBtn}
                        </button>
                        <button
                          type="button"
                          className="panel-btn ghost sm danger"
                          onClick={() => setDeletingShift(shift)}
                          title={copy.opsScheduleDeleteBtn}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Modal 1: Batch Assign Shifts on Selected Day */}
      {isBatchModalOpen && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-shift-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setIsBatchModalOpen(false)}
          />
          <section
            ref={batchModalRef}
            className="booking-popup cabinet-shift-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-batch-shift-title"
          >
            <div className="booking-popup-card cabinet-shift-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setIsBatchModalOpen(false)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>

              <h3 id="cabinet-batch-shift-title">
                {copy.plannerBatchModalTitle.replace("{date}", batchDate)}
              </h3>
              <p className="cabinet-shift-dialog-sub">{copy.opsScheduleSubtitle}</p>

              <form className="cabinet-shift-form" onSubmit={handleBatchSubmit}>
                {/* Date Selection */}
                <div className="cabinet-shift-field-group">
                  <label htmlFor="batch-date">{copy.opsScheduleDateLabel}</label>
                  <input
                    id="batch-date"
                    type="date"
                    required
                    value={batchDate}
                    onChange={(e) => setBatchDate(e.target.value)}
                    className="cabinet-shift-input"
                  />
                </div>

                {/* Shift Time Presets */}
                <div className="cabinet-shift-field-group">
                  <label>{copy.opsSchedulePresetsTitle}</label>
                  <div className="cabinet-shift-preset-buttons">
                    <button
                      type="button"
                      className={`cabinet-shift-preset-pill ${batchStart === "08:00" && batchEnd === "16:00" ? "active" : ""}`}
                      onClick={() => {
                        setBatchStart("08:00");
                        setBatchEnd("16:00");
                      }}
                    >
                      {copy.opsSchedulePresetMorning}
                    </button>
                    <button
                      type="button"
                      className={`cabinet-shift-preset-pill ${batchStart === "10:00" && batchEnd === "22:00" ? "active" : ""}`}
                      onClick={() => {
                        setBatchStart("10:00");
                        setBatchEnd("22:00");
                      }}
                    >
                      {copy.opsSchedulePresetDay}
                    </button>
                    <button
                      type="button"
                      className={`cabinet-shift-preset-pill ${batchStart === "14:00" && batchEnd === "23:00" ? "active" : ""}`}
                      onClick={() => {
                        setBatchStart("14:00");
                        setBatchEnd("23:00");
                      }}
                    >
                      {copy.opsSchedulePresetEvening}
                    </button>
                  </div>
                </div>

                {/* Time Range */}
                <div className="cabinet-shift-time-row">
                  <div className="cabinet-shift-field-group">
                    <label htmlFor="batch-start">{copy.opsScheduleTimeStart}</label>
                    <input
                      id="batch-start"
                      type="time"
                      required
                      value={batchStart}
                      onChange={(e) => setBatchStart(e.target.value)}
                      className="cabinet-shift-input"
                    />
                  </div>
                  <div className="cabinet-shift-field-group">
                    <label htmlFor="batch-end">{copy.opsScheduleTimeEnd}</label>
                    <input
                      id="batch-end"
                      type="time"
                      required
                      value={batchEnd}
                      onChange={(e) => setBatchEnd(e.target.value)}
                      className="cabinet-shift-input"
                    />
                  </div>
                </div>

                {/* Multi Waiters Selection */}
                <div className="cabinet-shift-field-group">
                  <div className="cabinet-shift-staff-header">
                    <label>{copy.plannerSelectWaiters} ({validBatchWaiters.length})</label>
                    {waiters.length > 0 && (
                      <div className="cabinet-shift-staff-bulk-actions">
                        <button
                          type="button"
                          className="cabinet-shift-bulk-btn"
                          onClick={() =>
                            setBatchWaiters(
                              waiters
                                .filter((w) => !findShiftConflict(shifts, w.id, batchDate, batchStart, batchEnd))
                                .map((w) => w.id),
                            )
                          }
                        >
                          {copy.opsScheduleSelectAll}
                        </button>
                        <button
                          type="button"
                          className="cabinet-shift-bulk-btn"
                          onClick={() => setBatchWaiters([])}
                        >
                          {copy.opsScheduleDeselectAll}
                        </button>
                      </div>
                    )}
                  </div>

                  {waiters.length === 0 ? (
                    <p className="fa-muted" style={{ fontSize: "0.82rem" }}>
                      {locale === "ro" ? "Niciun ospătar adăugat" : "Официанты не добавлены"}
                    </p>
                  ) : (
                    <div className="cabinet-shift-staff-grid">
                      {waiters.map((w) => {
                        const conflict = findShiftConflict(shifts, w.id, batchDate, batchStart, batchEnd);
                        const isSelected = !conflict && validBatchWaiters.includes(w.id);
                        const name = w.name?.trim() || w.email.split("@")[0];
                        return (
                          <button
                            key={w.id}
                            type="button"
                            disabled={!!conflict}
                            title={conflict ? formatConflictLabel(conflict, locale) : undefined}
                            className={`cabinet-shift-staff-pill ${isSelected ? "selected" : ""} ${conflict ? "conflict" : ""}`}
                            onClick={() => {
                              if (conflict) return;
                              setBatchWaiters((prev) =>
                                isSelected ? prev.filter((id) => id !== w.id) : [...prev, w.id]
                              );
                            }}
                          >
                            <span className="cabinet-shift-checkbox">{conflict ? "!" : isSelected ? "✓" : ""}</span>
                            <span className="cabinet-staff-avatar xs" aria-hidden="true">
                              {name.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="cabinet-shift-staff-pill-meta">
                              <span className="cabinet-shift-staff-pill-name">{name}</span>
                              {conflict && (
                                <small className="cabinet-shift-pill-conflict">
                                  {formatConflictLabel(conflict, locale)}
                                </small>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Multi Cooks Selection */}
                <div className="cabinet-shift-field-group">
                  <div className="cabinet-shift-staff-header">
                    <label>{copy.plannerSelectCooks} ({validBatchCooks.length})</label>
                    {cooks.length > 0 && (
                      <div className="cabinet-shift-staff-bulk-actions">
                        <button
                          type="button"
                          className="cabinet-shift-bulk-btn"
                          onClick={() =>
                            setBatchCooks(
                              cooks
                                .filter((c) => !findShiftConflict(shifts, c.id, batchDate, batchStart, batchEnd))
                                .map((c) => c.id),
                            )
                          }
                        >
                          {copy.opsScheduleSelectAll}
                        </button>
                        <button
                          type="button"
                          className="cabinet-shift-bulk-btn"
                          onClick={() => setBatchCooks([])}
                        >
                          {copy.opsScheduleDeselectAll}
                        </button>
                      </div>
                    )}
                  </div>

                  {cooks.length === 0 ? (
                    <p className="fa-muted" style={{ fontSize: "0.82rem" }}>
                      {locale === "ro" ? "Niciun bucătar adăugat" : "Повара не добавлены"}
                    </p>
                  ) : (
                    <div className="cabinet-shift-staff-grid">
                      {cooks.map((c) => {
                        const conflict = findShiftConflict(shifts, c.id, batchDate, batchStart, batchEnd);
                        const isSelected = !conflict && validBatchCooks.includes(c.id);
                        const name = c.name?.trim() || c.email.split("@")[0];
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={!!conflict}
                            title={conflict ? formatConflictLabel(conflict, locale) : undefined}
                            className={`cabinet-shift-staff-pill ${isSelected ? "selected" : ""} ${conflict ? "conflict" : ""}`}
                            onClick={() => {
                              if (conflict) return;
                              setBatchCooks((prev) =>
                                isSelected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                              );
                            }}
                          >
                            <span className="cabinet-shift-checkbox">{conflict ? "!" : isSelected ? "✓" : ""}</span>
                            <span className="cabinet-staff-avatar xs" aria-hidden="true">
                              {name.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="cabinet-shift-staff-pill-meta">
                              <span className="cabinet-shift-staff-pill-name">{name}</span>
                              {conflict && (
                                <small className="cabinet-shift-pill-conflict">
                                  {formatConflictLabel(conflict, locale)}
                                </small>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Optional Note */}
                <div className="cabinet-shift-field-group">
                  <label htmlFor="batch-note">{copy.opsScheduleNoteLabel}</label>
                  <input
                    id="batch-note"
                    type="text"
                    value={batchNote}
                    onChange={(e) => setBatchNote(e.target.value)}
                    placeholder={copy.opsScheduleNotePlaceholder}
                    className="cabinet-shift-input"
                  />
                </div>

                {/* Actions */}
                <div className="cabinet-shift-actions">
                  <button
                    type="submit"
                    className="panel-btn primary"
                    disabled={busy || (validBatchWaiters.length === 0 && validBatchCooks.length === 0)}
                  >
                    {copy.opsScheduleSubmitBtn} ({validBatchWaiters.length + validBatchCooks.length})
                  </button>
                  <button
                    type="button"
                    className="panel-btn ghost"
                    disabled={busy}
                    onClick={() => setIsBatchModalOpen(false)}
                  >
                    {copy.opsMenuCancel}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* Modal 2: Recurring Schedule Generator (2/2 or Weekdays) */}
      {isRecurringModalOpen && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-shift-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setIsRecurringModalOpen(false)}
          />
          <section
            ref={recurringModalRef}
            className="booking-popup cabinet-shift-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-recurring-modal-title"
          >
            <div className="booking-popup-card cabinet-shift-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setIsRecurringModalOpen(false)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>

              <h3 id="cabinet-recurring-modal-title">{copy.plannerRecurringModalTitle}</h3>
              <p className="cabinet-shift-dialog-sub">
                {locale === "ro"
                  ? "Generați automat ture pentru mai mulți angajați pe săptămâni înainte"
                  : "Автоматическая генерация графика для сотрудников на период вперед"}
              </p>

              <form className="cabinet-shift-form" onSubmit={handleRecurringSubmit}>
                {/* Pattern Toggle */}
                <div className="cabinet-shift-field-group">
                  <label>{copy.plannerRecurringPattern}</label>
                  <div className="cabinet-shift-role-toggle">
                    <button
                      type="button"
                      className={`cabinet-shift-role-btn ${recurringPattern === "2/2" ? "active" : ""}`}
                      onClick={() => setRecurringPattern("2/2")}
                    >
                      {copy.plannerPattern22}
                    </button>
                    <button
                      type="button"
                      className={`cabinet-shift-role-btn ${recurringPattern === "weekdays" ? "active" : ""}`}
                      onClick={() => setRecurringPattern("weekdays")}
                    >
                      {copy.plannerPatternWeekdays}
                    </button>
                  </div>
                </div>

                {/* If Weekdays: choose days of week */}
                {recurringPattern === "weekdays" && (
                  <div className="cabinet-shift-field-group">
                    <label>{locale === "ro" ? "Zile active din săptămână" : "Рабочие дни недели"}</label>
                    <div className="cabinet-planner-weekday-pills">
                      {[
                        { num: 1, label: locale === "ro" ? "Luni" : "Пн" },
                        { num: 2, label: locale === "ro" ? "Marți" : "Вт" },
                        { num: 3, label: locale === "ro" ? "Miercuri" : "Ср" },
                        { num: 4, label: locale === "ro" ? "Joi" : "Чт" },
                        { num: 5, label: locale === "ro" ? "Vineri" : "Пт" },
                        { num: 6, label: locale === "ro" ? "Sâmbătă" : "Сб" },
                        { num: 7, label: locale === "ro" ? "Duminică" : "Вс" },
                      ].map((day) => {
                        const isChecked = recurringWeekdays.includes(day.num);
                        return (
                          <button
                            key={day.num}
                            type="button"
                            className={`cabinet-planner-weekday-pill ${isChecked ? "active" : ""}`}
                            onClick={() => {
                              setRecurringWeekdays((prev) =>
                                isChecked ? prev.filter((d) => d !== day.num) : [...prev, day.num]
                              );
                            }}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Start Date & Period */}
                <div className="cabinet-shift-time-row">
                  <div className="cabinet-shift-field-group">
                    <label htmlFor="rec-start-date">
                      {locale === "ro" ? "Data de început" : "Дата начала графика"}
                    </label>
                    <input
                      id="rec-start-date"
                      type="date"
                      required
                      value={recurringStartDate}
                      onChange={(e) => setRecurringStartDate(e.target.value)}
                      className="cabinet-shift-input"
                    />
                  </div>
                  <div className="cabinet-shift-field-group">
                    <label htmlFor="rec-period">{copy.plannerPeriod}</label>
                    <select
                      id="rec-period"
                      value={recurringPeriodWeeks}
                      onChange={(e) => setRecurringPeriodWeeks(Number(e.target.value))}
                      className="cabinet-shift-input"
                    >
                      <option value={2}>{copy.planner2Weeks}</option>
                      <option value={4}>{copy.planner1Month}</option>
                    </select>
                  </div>
                </div>

                {/* Time Range */}
                <div className="cabinet-shift-time-row">
                  <div className="cabinet-shift-field-group">
                    <label htmlFor="rec-start">{copy.opsScheduleTimeStart}</label>
                    <input
                      id="rec-start"
                      type="time"
                      required
                      value={recurringStart}
                      onChange={(e) => setRecurringStart(e.target.value)}
                      className="cabinet-shift-input"
                    />
                  </div>
                  <div className="cabinet-shift-field-group">
                    <label htmlFor="rec-end">{copy.opsScheduleTimeEnd}</label>
                    <input
                      id="rec-end"
                      type="time"
                      required
                      value={recurringEnd}
                      onChange={(e) => setRecurringEnd(e.target.value)}
                      className="cabinet-shift-input"
                    />
                  </div>
                </div>

                {/* Staff Selection for Recurring Schedule */}
                <div className="cabinet-shift-field-group">
                  <div className="cabinet-shift-staff-header">
                    <label>{copy.opsScheduleStaffSelect} ({recurringStaffIds.length})</label>
                    <div className="cabinet-shift-staff-bulk-actions">
                      <button
                        type="button"
                        className="cabinet-shift-bulk-btn"
                        onClick={() => setRecurringStaffIds(staff.map((s) => s.id))}
                      >
                        {copy.opsScheduleSelectAll}
                      </button>
                      <button
                        type="button"
                        className="cabinet-shift-bulk-btn"
                        onClick={() => setRecurringStaffIds([])}
                      >
                        {copy.opsScheduleDeselectAll}
                      </button>
                    </div>
                  </div>

                  <div className="cabinet-shift-staff-grid">
                    {staff.map((m) => {
                      const isSelected = recurringStaffIds.includes(m.id);
                      const name = m.name?.trim() || m.email.split("@")[0];
                      const isCook = m.role === "cook";
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`cabinet-shift-staff-pill ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setRecurringStaffIds((prev) =>
                              isSelected ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                            );
                          }}
                        >
                          <span className="cabinet-shift-checkbox">{isSelected ? "✓" : ""}</span>
                          <span className="cabinet-staff-avatar xs" aria-hidden="true">
                            {name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="cabinet-shift-staff-pill-name">{name}</span>
                          <small className="cabinet-planner-role-tiny">
                            {isCook ? "👨‍🍳" : "👤"}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Optional Note */}
                <div className="cabinet-shift-field-group">
                  <label htmlFor="rec-note">{copy.opsScheduleNoteLabel}</label>
                  <input
                    id="rec-note"
                    type="text"
                    value={recurringNote}
                    onChange={(e) => setRecurringNote(e.target.value)}
                    placeholder={copy.opsScheduleNotePlaceholder}
                    className="cabinet-shift-input"
                  />
                </div>

                {/* Recurring generation conflict preview */}
                {recurringStaffIds.length > 0 && recurringDates.length > 0 && (
                  <div className="cabinet-recurring-preview">
                    <span>
                      {locale === "ro"
                        ? `Vor fi create: ${recurringSummary.availableSlots} ture`
                        : locale === "en"
                        ? `Shifts to create: ${recurringSummary.availableSlots}`
                        : `Будет создано смен: ${recurringSummary.availableSlots}`}
                    </span>
                    {recurringSummary.conflictSlots > 0 && (
                      <small className="cabinet-recurring-skipped">
                        {locale === "ro"
                          ? ` (${recurringSummary.conflictSlots} omise din cauza suprapunerilor)`
                          : locale === "en"
                          ? ` (${recurringSummary.conflictSlots} skipped due to existing shifts)`
                          : ` (${recurringSummary.conflictSlots} пропущено — уже назначены/ожидают)`}
                      </small>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="cabinet-shift-actions">
                  <button
                    type="submit"
                    className="panel-btn primary"
                    disabled={busy || recurringStaffIds.length === 0 || recurringSummary.availableSlots === 0}
                  >
                    ⚡ {copy.plannerGenerateBtn} ({recurringSummary.availableSlots})
                  </button>
                  <button
                    type="button"
                    className="panel-btn ghost"
                    disabled={busy}
                    onClick={() => setIsRecurringModalOpen(false)}
                  >
                    {copy.opsMenuCancel}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* Modal 3: Swap Staff Member on Shift (Direct list of free candidates, no dropdown) */}
      {swappingShift && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-shift-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setSwappingShift(null)}
          />
          <section
            ref={swapModalRef}
            className="booking-popup cabinet-shift-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-swap-modal-title"
          >
            <div className="booking-popup-card cabinet-shift-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setSwappingShift(null)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>

              <h3 id="cabinet-swap-modal-title">{copy.plannerSwapModalTitle}</h3>
              <p className="cabinet-shift-dialog-sub">
                {copy.plannerSwapModalSub.replace("{name}", swappingShift.staff_name)}
              </p>

              {/* Shift info snippet */}
              <div className="cabinet-planner-swap-target-box">
                <div>
                  <strong>{swappingShift.date} · {swappingShift.start_time} – {swappingShift.end_time}</strong>
                  <span className={`cabinet-staff-role-tag role-${swappingShift.role || "waiter"}`}>
                    {swappingShift.role === "cook" ? copy.opsStaffRoleCook : copy.opsStaffRoleWaiter}
                  </span>
                </div>
                {swappingShift.reason && (
                  <p className="cabinet-planner-swap-target-reason">
                    ⚠️ {locale === "ro" ? "Motiv:" : locale === "en" ? "Reason:" : "Причина:"} {swappingShift.reason}
                  </p>
                )}
              </div>

              <form className="cabinet-shift-form" onSubmit={handleSwapSubmit}>
                <div className="cabinet-shift-field-group">
                  <label>{copy.plannerSelectReplacement}</label>
                  {swapCandidates.length === 0 ? (
                    <p className="cabinet-swap-empty-note">
                      {locale === "ro"
                        ? "Nu există alți angajați cu acest rol"
                        : locale === "en"
                        ? "No other staff members with this role"
                        : "Нет других сотрудников с этой ролью"}
                    </p>
                  ) : (
                    <div className="cabinet-swap-candidates-list" role="radiogroup" aria-label={copy.plannerSelectReplacement}>
                      {swapCandidates.map(({ member, conflict }) => {
                        const displayName = member.name?.trim() || member.email.split("@")[0];
                        const isSelected = !conflict && replacementStaffId === member.id;
                        return (
                          <button
                            key={member.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            disabled={!!conflict}
                            className={`cabinet-swap-candidate-card ${isSelected ? "selected" : ""} ${conflict ? "busy" : "free"}`}
                            onClick={() => {
                              if (!conflict) setReplacementStaffId(member.id);
                            }}
                          >
                            <div className="cabinet-swap-candidate-left">
                              <span className="cabinet-shift-checkbox">
                                {conflict ? "✕" : isSelected ? "✓" : ""}
                              </span>
                              <span className="cabinet-staff-avatar xs" aria-hidden="true">
                                {displayName.slice(0, 2).toUpperCase()}
                              </span>
                              <div className="cabinet-swap-candidate-info">
                                <strong>{displayName}</strong>
                                <small>{member.email}</small>
                              </div>
                            </div>
                            <span className={`cabinet-swap-availability-pill ${conflict ? "busy" : "free"}`}>
                              {conflict
                                ? formatConflictLabel(conflict, locale)
                                : (locale === "ro" ? "✓ Disponibil" : locale === "en" ? "✓ Available" : "✓ Свободен")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="cabinet-shift-actions">
                  <button
                    type="submit"
                    className="panel-btn primary"
                    disabled={busy || !replacementStaffId}
                  >
                    ⇄ {copy.plannerConfirmSwap}
                  </button>
                  <button
                    type="button"
                    className="panel-btn ghost"
                    disabled={busy}
                    onClick={() => setSwappingShift(null)}
                  >
                    {copy.opsMenuCancel}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* Modal 4: Custom Delete Shift Confirmation Popup */}
      {deletingShift && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setDeletingShift(null)}
          />
          <section
            ref={deleteModalRef}
            className="booking-popup cabinet-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-shift-delete-title"
          >
            <div className="booking-popup-card cabinet-delete-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setDeletingShift(null)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>
              <div className="cabinet-delete-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <h3 id="cabinet-shift-delete-title">
                {locale === "ro"
                  ? "Eliminați angajatul din tură?"
                  : locale === "en"
                  ? "Remove staff member from shift?"
                  : "Снять сотрудника со смены?"}
              </h3>
              <p className="cabinet-delete-text">
                {locale === "ro"
                  ? `Sigur doriți să îl eliminați pe ${deletingShift.staff_name} din tura de pe ${deletingShift.date} (${deletingShift.start_time} – ${deletingShift.end_time})?`
                  : locale === "en"
                  ? `Are you sure you want to remove ${deletingShift.staff_name} from the shift on ${deletingShift.date} (${deletingShift.start_time} – ${deletingShift.end_time})?`
                  : `Вы уверены, что хотите удалить смену сотрудника ${deletingShift.staff_name} на ${deletingShift.date} (${deletingShift.start_time} – ${deletingShift.end_time})?`}
              </p>
              <div className="cabinet-delete-actions">
                <button
                  type="button"
                  className="panel-btn danger"
                  disabled={busy}
                  onClick={() => void handleConfirmDeleteShift()}
                >
                  {locale === "ro" ? "Șterge tura" : locale === "en" ? "Delete shift" : "Удалить смену"}
                </button>
                <button
                  type="button"
                  className="panel-btn ghost"
                  data-autofocus
                  disabled={busy}
                  onClick={() => setDeletingShift(null)}
                >
                  {copy.opsMenuCancel}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}

