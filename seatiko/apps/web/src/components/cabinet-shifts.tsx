"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/locale-provider";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { getSiteCopy } from "@/lib/site-copy";
import {
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

export function CabinetShiftsPlanner({ venueId }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Calendar navigation state
  const todayStr = useMemo(() => toDateString(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [weekOffset, setWeekOffset] = useState(0);

  // Modals state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [swappingShift, setSwappingShift] = useState<WorkShift | null>(null);

  const batchModalRef = useRef<HTMLElement>(null);
  const recurringModalRef = useRef<HTMLElement>(null);
  const swapModalRef = useRef<HTMLElement>(null);

  useDialogFocus(isBatchModalOpen, batchModalRef, () => setIsBatchModalOpen(false));
  useDialogFocus(isRecurringModalOpen, recurringModalRef, () => setIsRecurringModalOpen(false));
  useDialogFocus(!!swappingShift, swapModalRef, () => setSwappingShift(null));

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
          if (!cancelled) setMessage(locale === "ro" ? "Eroare la încărcare" : "Ошибка загрузки");
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
      setMessage(ok);
    } catch {
      setMessage(locale === "ro" ? "Eroare de operare" : locale === "en" ? "Operation error" : "Ошибка операции");
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

  // Helper to open Batch Modal for current day
  function openBatchModal() {
    setBatchDate(selectedDate);
    setBatchWaiters(waiters.map((w) => w.id));
    setBatchCooks(cooks.map((c) => c.id));
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
    // Find available staff of same role who are not this shift's staff
    const candidates = staff.filter(
      (m) => (m.role || "waiter") === (shift.role || "waiter") && m.id !== shift.staff_id
    );
    setReplacementStaffId(candidates[0]?.id || "");
  }

  // Submit Batch Modal
  async function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allSelectedStaff = [...batchWaiters, ...batchCooks];
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
    if (recurringStaffIds.length === 0) return;

    // Generate dates based on pattern
    const generatedDates: string[] = [];
    const start = new Date(recurringStartDate + "T00:00:00");
    const totalDays = recurringPeriodWeeks * 7;

    for (let i = 0; i < totalDays; i++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      const curStr = toDateString(cur);

      if (recurringPattern === "2/2") {
        // 2 days on, 2 days off (cycle of 4)
        if (i % 4 === 0 || i % 4 === 1) {
          generatedDates.push(curStr);
        }
      } else {
        // Weekdays pattern
        const dayOfWeek = cur.getDay() === 0 ? 7 : cur.getDay(); // 1=Mon .. 7=Sun
        if (recurringWeekdays.includes(dayOfWeek)) {
          generatedDates.push(curStr);
        }
      }
    }

    if (generatedDates.length === 0) return;

    await run(async () => {
      await batchCreateVenueWorkShifts(venueId, {
        staff_ids: recurringStaffIds,
        dates: generatedDates,
        start_time: recurringStart,
        end_time: recurringEnd,
        note: recurringNote.trim() || undefined,
      });
      setIsRecurringModalOpen(false);
    }, locale === "ro"
      ? `Program stabil generat: ${generatedDates.length * recurringStaffIds.length} ture`
      : locale === "en"
      ? `Recurring schedule generated: ${generatedDates.length * recurringStaffIds.length} shifts`
      : `Сгенерирован стабильный график: ${generatedDates.length * recurringStaffIds.length} смен`);
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
        <div className="owner-notice success" role="alert">
          <span>✓</span>
          <p>{message}</p>
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
                          onClick={() => {
                            if (!window.confirm(locale === "ro" ? "Ștergeți această tură?" : "Удалить эту смену?")) return;
                            void run(async () => {
                              await deleteVenueWorkShift(venueId, shift.id);
                            }, locale === "ro" ? "Tura a fost ștearsă" : "Смена удалена");
                          }}
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
                          onClick={() => {
                            if (!window.confirm(locale === "ro" ? "Ștergeți această tură?" : "Удалить эту смену?")) return;
                            void run(async () => {
                              await deleteVenueWorkShift(venueId, shift.id);
                            }, locale === "ro" ? "Tura a fost ștearsă" : "Смена удалена");
                          }}
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
                    <label>{copy.plannerSelectWaiters} ({batchWaiters.length})</label>
                    {waiters.length > 0 && (
                      <div className="cabinet-shift-staff-bulk-actions">
                        <button
                          type="button"
                          className="cabinet-shift-bulk-btn"
                          onClick={() => setBatchWaiters(waiters.map((w) => w.id))}
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
                        const isSelected = batchWaiters.includes(w.id);
                        const name = w.name?.trim() || w.email.split("@")[0];
                        return (
                          <button
                            key={w.id}
                            type="button"
                            className={`cabinet-shift-staff-pill ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              setBatchWaiters((prev) =>
                                isSelected ? prev.filter((id) => id !== w.id) : [...prev, w.id]
                              );
                            }}
                          >
                            <span className="cabinet-shift-checkbox">{isSelected ? "✓" : ""}</span>
                            <span className="cabinet-staff-avatar xs" aria-hidden="true">
                              {name.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="cabinet-shift-staff-pill-name">{name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Multi Cooks Selection */}
                <div className="cabinet-shift-field-group">
                  <div className="cabinet-shift-staff-header">
                    <label>{copy.plannerSelectCooks} ({batchCooks.length})</label>
                    {cooks.length > 0 && (
                      <div className="cabinet-shift-staff-bulk-actions">
                        <button
                          type="button"
                          className="cabinet-shift-bulk-btn"
                          onClick={() => setBatchCooks(cooks.map((c) => c.id))}
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
                        const isSelected = batchCooks.includes(c.id);
                        const name = c.name?.trim() || c.email.split("@")[0];
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`cabinet-shift-staff-pill ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              setBatchCooks((prev) =>
                                isSelected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                              );
                            }}
                          >
                            <span className="cabinet-shift-checkbox">{isSelected ? "✓" : ""}</span>
                            <span className="cabinet-staff-avatar xs" aria-hidden="true">
                              {name.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="cabinet-shift-staff-pill-name">{name}</span>
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
                    disabled={busy || (batchWaiters.length === 0 && batchCooks.length === 0)}
                  >
                    {copy.opsScheduleSubmitBtn} ({batchWaiters.length + batchCooks.length})
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

                {/* Actions */}
                <div className="cabinet-shift-actions">
                  <button
                    type="submit"
                    className="panel-btn primary"
                    disabled={busy || recurringStaffIds.length === 0}
                  >
                    ⚡ {copy.plannerGenerateBtn}
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

      {/* Modal 3: Swap Staff Member on Shift */}
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
                    ⚠️ {locale === "ro" ? "Motiv:" : "Причина:"} {swappingShift.reason}
                  </p>
                )}
              </div>

              <form className="cabinet-shift-form" onSubmit={handleSwapSubmit}>
                <div className="cabinet-shift-field-group">
                  <label htmlFor="replacement-staff-select">{copy.plannerSelectReplacement}</label>
                  <select
                    id="replacement-staff-select"
                    value={replacementStaffId}
                    onChange={(e) => setReplacementStaffId(e.target.value)}
                    required
                    className="cabinet-shift-input"
                  >
                    {staff
                      .filter(
                        (m) =>
                          (m.role || "waiter") === (swappingShift.role || "waiter") &&
                          m.id !== swappingShift.staff_id
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.email} ({m.email})
                        </option>
                      ))}
                  </select>
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
    </div>
  );
}

