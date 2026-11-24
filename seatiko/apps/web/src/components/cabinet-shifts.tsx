"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/locale-provider";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { getSiteCopy } from "@/lib/site-copy";
import {
  ApiError,
  batchCreateVenueWorkShifts,
  copyVenueWorkShiftsWeek,
  createVenueWorkShift,
  deleteVenueWorkShift,
  listVenueStaff,
  listVenueWorkShifts,
  swapVenueWorkShiftStaff,
  type StaffMember,
  type WorkShift,
} from "@/lib/api";

type Props = {
  venueId: string;
  onAlertCountChange?: (count: number) => void;
};

type ViewMode = "matrix" | "day";
type RoleFilter = "all" | "waiter" | "cook";
type WaveMode = "alternate" | "team_a" | "team_b";

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

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toDateString(d);
}

function parseTimeMinutes(hhmm: string): number | null {
  const parts = (hhmm || "").trim().split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function calcDurationMinutes(start: string, end: string): number {
  const s = parseTimeMinutes(start);
  const e = parseTimeMinutes(end);
  if (s === null || e === null) return 0;
  let mins = e - s;
  if (mins <= 0) mins += 24 * 60;
  return mins;
}

function formatDurationMinutes(mins: number, locale: "ru" | "ro" | "en"): string {
  if (mins <= 0) return "";
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  const hUnit = locale === "ro" ? "ore" : locale === "en" ? "h" : "ч";
  const mUnit = locale === "ro" ? "min" : locale === "en" ? "m" : "мин";
  if (remMin === 0) return `${hrs} ${hUnit}`;
  return `${hrs} ${hUnit} ${remMin} ${mUnit}`;
}

function formatHoursCompact(totalMins: number, locale: "ru" | "ro" | "en"): string {
  const hUnit = locale === "ro" ? "h" : locale === "en" ? "h" : "ч";
  const hrs = Math.round((totalMins / 60) * 10) / 10;
  return `${hrs} ${hUnit}`;
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

function formatShortShiftDate(dateStr: string, todayStr: string, locale: "ru" | "ro" | "en"): string {
  if (dateStr === todayStr) {
    return locale === "ro" ? "Astăzi" : locale === "en" ? "Today" : "Сегодня";
  }
  if (dateStr === addDays(todayStr, 1)) {
    return locale === "ro" ? "Mâine" : locale === "en" ? "Tomorrow" : "Завтра";
  }
  try {
    const d = new Date(dateStr + "T00:00:00");
    const lang = locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU";
    return d.toLocaleDateString(lang, { day: "numeric", month: "short", weekday: "short" });
  } catch {
    return dateStr;
  }
}

export function CabinetShiftsPlanner({ venueId, onAlertCountChange }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Planner View & Filters
  const todayStr = useMemo(() => toDateString(new Date()), []);
  const [viewMode, setViewMode] = useState<ViewMode>("matrix");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [weekOffset, setWeekOffset] = useState(0);

  // Modals State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [isCopyWeekModalOpen, setIsCopyWeekModalOpen] = useState(false);
  const [quickCell, setQuickCell] = useState<{ member: StaffMember; date: string } | null>(null);
  const [focusedStaff, setFocusedStaff] = useState<StaffMember | null>(null);
  const [inspectingShift, setInspectingShift] = useState<WorkShift | null>(null);
  const [swappingShift, setSwappingShift] = useState<WorkShift | null>(null);
  const [deletingShift, setDeletingShift] = useState<WorkShift | null>(null);

  const batchModalRef = useRef<HTMLElement>(null);
  const recurringModalRef = useRef<HTMLElement>(null);
  const copyWeekModalRef = useRef<HTMLElement>(null);
  const quickModalRef = useRef<HTMLElement>(null);
  const personalModalRef = useRef<HTMLElement>(null);
  const inspectModalRef = useRef<HTMLElement>(null);
  const swapModalRef = useRef<HTMLElement>(null);
  const deleteModalRef = useRef<HTMLElement>(null);

  useDialogFocus(isBatchModalOpen, batchModalRef, () => setIsBatchModalOpen(false));
  useDialogFocus(isRecurringModalOpen, recurringModalRef, () => setIsRecurringModalOpen(false));
  useDialogFocus(isCopyWeekModalOpen, copyWeekModalRef, () => setIsCopyWeekModalOpen(false));
  useDialogFocus(!!quickCell, quickModalRef, () => setQuickCell(null));
  useDialogFocus(!!focusedStaff, personalModalRef, () => setFocusedStaff(null));
  useDialogFocus(!!inspectingShift, inspectModalRef, () => setInspectingShift(null));
  useDialogFocus(!!swappingShift, swapModalRef, () => setSwappingShift(null));
  useDialogFocus(!!deletingShift, deleteModalRef, () => setDeletingShift(null));

  const anyModalOpen =
    isBatchModalOpen ||
    isRecurringModalOpen ||
    isCopyWeekModalOpen ||
    !!quickCell ||
    !!focusedStaff ||
    !!inspectingShift ||
    !!swappingShift ||
    !!deletingShift;

  useEffect(() => {
    if (!anyModalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [anyModalOpen]);

  // Batch Form State
  const [batchDate, setBatchDate] = useState(selectedDate);
  const [batchStart, setBatchStart] = useState("10:00");
  const [batchEnd, setBatchEnd] = useState("22:00");
  const [batchWaiters, setBatchWaiters] = useState<string[]>([]);
  const [batchCooks, setBatchCooks] = useState<string[]>([]);
  const [batchNote, setBatchNote] = useState("");

  // Quick 1-Cell Assign State
  const [quickDate, setQuickDate] = useState(todayStr);
  const [quickStart, setQuickStart] = useState("10:00");
  const [quickEnd, setQuickEnd] = useState("22:00");
  const [quickNote, setQuickNote] = useState("");

  // Recurring Form State
  const [recurringPattern, setRecurringPattern] = useState<"2/2" | "weekdays">("2/2");
  const [recurringWaveMode, setRecurringWaveMode] = useState<WaveMode>("alternate");
  const [recurringStartDate, setRecurringStartDate] = useState(selectedDate);
  const [recurringPeriodWeeks, setRecurringPeriodWeeks] = useState<number>(2);
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
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
    const days: { date: string; dayNum: number; dayName: string; monthShort: string; isToday: boolean; isSelected: boolean }[] = [];
    const lang = locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU";

    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      const str = toDateString(cur);
      const dayName = cur.toLocaleDateString(lang, { weekday: "short" });
      const monthShort = cur.toLocaleDateString(lang, { month: "short" });
      days.push({
        date: str,
        dayNum: cur.getDate(),
        dayName: dayName.toUpperCase(),
        monthShort,
        isToday: str === todayStr,
        isSelected: str === selectedDate,
      });
    }
    return days;
  }, [weekOffset, locale, todayStr, selectedDate]);

  const currentWeekStart = weekDays[0]?.date || todayStr;
  const currentWeekEnd = weekDays[6]?.date || todayStr;
  const prevWeekStart = useMemo(() => addDays(currentWeekStart, -7), [currentWeekStart]);
  const prevWeekEnd = useMemo(() => addDays(currentWeekStart, -1), [currentWeekStart]);

  const weekRangeLabel = useMemo(() => {
    if (weekDays.length < 7) return "";
    const first = weekDays[0];
    const last = weekDays[6];
    if (first.monthShort === last.monthShort) {
      return `${first.dayNum} – ${last.dayNum} ${last.monthShort}`;
    }
    return `${first.dayNum} ${first.monthShort} – ${last.dayNum} ${last.monthShort}`;
  }, [weekDays]);

  // Global upcoming alerted shifts (across ALL dates >= today)
  const globalAlertedShifts = useMemo(() => {
    return shifts
      .filter((s) => s.date >= todayStr && (s.status === "SWAP_REQUESTED" || s.status === "DECLINED"))
      .sort((a, b) => (a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)));
  }, [shifts, todayStr]);

  useEffect(() => {
    onAlertCountChange?.(globalAlertedShifts.length);
  }, [globalAlertedShifts.length, onAlertCountChange]);

  // Previous week copyable shifts count
  const prevWeekCopyableCount = useMemo(() => {
    return shifts.filter(
      (s) => s.date >= prevWeekStart && s.date <= prevWeekEnd && s.status !== "DECLINED",
    ).length;
  }, [shifts, prevWeekStart, prevWeekEnd]);

  // Selected day shifts (for Day View)
  const dayShifts = useMemo(() => shifts.filter((s) => s.date === selectedDate), [shifts, selectedDate]);
  const dayWaiters = useMemo(() => dayShifts.filter((s) => (s.role || "waiter") === "waiter"), [dayShifts]);
  const dayCooks = useMemo(() => dayShifts.filter((s) => s.role === "cook"), [dayShifts]);

  const waiters = useMemo(() => staff.filter((m) => (m.role || "waiter") === "waiter"), [staff]);
  const cooks = useMemo(() => staff.filter((m) => m.role === "cook"), [staff]);

  // Lookup map: `${staffId}::${date}` -> WorkShift[]
  const shiftCellMap = useMemo(() => {
    const map = new Map<string, WorkShift[]>();
    for (const s of shifts) {
      const key = `${s.staff_id}::${s.date}`;
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [shifts]);

  // Weekly stats per staff member in current week
  const staffWeekStats = useMemo(() => {
    const stats = new Map<string, { shiftCount: number; totalMinutes: number }>();
    for (const s of shifts) {
      if (s.date < currentWeekStart || s.date > currentWeekEnd) continue;
      if (s.status === "DECLINED") continue;
      const cur = stats.get(s.staff_id) || { shiftCount: 0, totalMinutes: 0 };
      cur.shiftCount += 1;
      cur.totalMinutes += calcDurationMinutes(s.start_time, s.end_time);
      stats.set(s.staff_id, cur);
    }
    return stats;
  }, [shifts, currentWeekStart, currentWeekEnd]);

  // Personal schedule shifts for focusedStaff
  const focusedStaffShifts = useMemo(() => {
    if (!focusedStaff) return [];
    return shifts
      .filter((s) => s.staff_id === focusedStaff.id)
      .sort((a, b) => (a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)));
  }, [focusedStaff, shifts]);

  const focusedStaffStats = useMemo(() => {
    let confirmed = 0;
    let pending = 0;
    let totalMinutes = 0;
    for (const s of focusedStaffShifts) {
      if (s.status === "CONFIRMED") {
        confirmed++;
        totalMinutes += calcDurationMinutes(s.start_time, s.end_time);
      } else if (s.status === "PENDING") {
        pending++;
        totalMinutes += calcDurationMinutes(s.start_time, s.end_time);
      }
    }
    return { confirmed, pending, totalMinutes };
  }, [focusedStaffShifts]);

  // Batch modal valid selections
  const validBatchWaiters = useMemo(
    () => batchWaiters.filter((id) => !findShiftConflict(shifts, id, batchDate, batchStart, batchEnd)),
    [batchWaiters, shifts, batchDate, batchStart, batchEnd],
  );
  const validBatchCooks = useMemo(
    () => batchCooks.filter((id) => !findShiftConflict(shifts, id, batchDate, batchStart, batchEnd)),
    [batchCooks, shifts, batchDate, batchStart, batchEnd],
  );

  // Quick 1-cell conflict check
  const quickCellConflict = useMemo(() => {
    if (!quickCell) return undefined;
    return findShiftConflict(shifts, quickCell.member.id, quickDate, quickStart, quickEnd);
  }, [quickCell, shifts, quickDate, quickStart, quickEnd]);

  // Recurring schedule calculation with 2/2 waves
  const recurringAssignments = useMemo(() => {
    if (!recurringStartDate || recurringStaffIds.length === 0) {
      return { teamADates: [] as string[], teamBDates: [] as string[], teamAStaff: [] as string[], teamBStaff: [] as string[], availableSlots: 0, conflictSlots: 0 };
    }
    const start = new Date(recurringStartDate + "T00:00:00");
    if (isNaN(start.getTime())) {
      return { teamADates: [] as string[], teamBDates: [] as string[], teamAStaff: [] as string[], teamBStaff: [] as string[], availableSlots: 0, conflictSlots: 0 };
    }
    const totalDays = recurringPeriodWeeks * 7;
    const teamADates: string[] = [];
    const teamBDates: string[] = [];

    for (let i = 0; i < totalDays; i++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      const curStr = toDateString(cur);
      if (recurringPattern === "2/2") {
        if (i % 4 === 0 || i % 4 === 1) teamADates.push(curStr);
        else teamBDates.push(curStr);
      } else {
        const dayOfWeek = cur.getDay() === 0 ? 7 : cur.getDay();
        if (recurringWeekdays.includes(dayOfWeek)) {
          teamADates.push(curStr);
        }
      }
    }

    let teamAStaff: string[] = [];
    const teamBStaff: string[] = [];
    let datesA = teamADates;
    let datesB: string[] = [];

    if (recurringPattern === "2/2") {
      if (recurringWaveMode === "team_a") {
        teamAStaff = recurringStaffIds;
        datesA = teamADates;
      } else if (recurringWaveMode === "team_b") {
        teamAStaff = recurringStaffIds;
        datesA = teamBDates;
      } else {
        // Alternate 50/50 split separately per role so waiters and cooks both cover every day
        const selectedSet = new Set(recurringStaffIds);
        const selWaiters = waiters.filter((w) => selectedSet.has(w.id)).map((w) => w.id);
        const selCooks = cooks.filter((c) => selectedSet.has(c.id)).map((c) => c.id);
        selWaiters.forEach((id, idx) => (idx % 2 === 0 ? teamAStaff.push(id) : teamBStaff.push(id)));
        selCooks.forEach((id, idx) => (idx % 2 === 0 ? teamAStaff.push(id) : teamBStaff.push(id)));
        datesA = teamADates;
        datesB = teamBDates;
      }
    } else {
      teamAStaff = recurringStaffIds;
      datesA = teamADates;
    }

    let availableSlots = 0;
    let conflictSlots = 0;
    for (const sid of teamAStaff) {
      for (const d of datesA) {
        if (findShiftConflict(shifts, sid, d, recurringStart, recurringEnd)) conflictSlots++;
        else availableSlots++;
      }
    }
    for (const sid of teamBStaff) {
      for (const d of datesB) {
        if (findShiftConflict(shifts, sid, d, recurringStart, recurringEnd)) conflictSlots++;
        else availableSlots++;
      }
    }

    return { teamADates: datesA, teamBDates: datesB, teamAStaff, teamBStaff, availableSlots, conflictSlots };
  }, [
    recurringStartDate,
    recurringStaffIds,
    recurringPeriodWeeks,
    recurringPattern,
    recurringWaveMode,
    recurringWeekdays,
    waiters,
    cooks,
    shifts,
    recurringStart,
    recurringEnd,
  ]);

  // Swap modal candidate cards
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

  // Modal openers
  function openBatchModal() {
    setBatchDate(selectedDate);
    // Do NOT pre-select everyone by default so the owner clicks only who they need
    setBatchWaiters([]);
    setBatchCooks([]);
    setBatchNote("");
    setIsBatchModalOpen(true);
  }

  function openQuickCellModal(member: StaffMember, date: string) {
    setQuickCell({ member, date });
    setQuickDate(date);
    setQuickStart("10:00");
    setQuickEnd("22:00");
    setQuickNote("");
  }

  function openRecurringModal() {
    setRecurringStartDate(selectedDate);
    setRecurringStaffIds([]);
    setRecurringNote("");
    setIsRecurringModalOpen(true);
  }

  function openSwapModal(shift: WorkShift) {
    setInspectingShift(null);
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

  // Submit handlers
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

  async function handleQuickCellSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quickCell || quickCellConflict) return;
    const member = quickCell.member;
    await run(async () => {
      await createVenueWorkShift(venueId, {
        staff_id: member.id,
        date: quickDate,
        start_time: quickStart,
        end_time: quickEnd,
        note: quickNote.trim() || undefined,
      });
      setQuickCell(null);
    }, locale === "ro"
      ? `Tură programată pentru ${member.name || member.email}`
      : locale === "en"
      ? `Shift assigned for ${member.name || member.email}`
      : `Смена назначена: ${member.name || member.email}`);
  }

  async function handleRecurringSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (recurringAssignments.availableSlots === 0) return;

    await run(async () => {
      if (recurringAssignments.teamAStaff.length > 0 && recurringAssignments.teamADates.length > 0) {
        await batchCreateVenueWorkShifts(venueId, {
          staff_ids: recurringAssignments.teamAStaff,
          dates: recurringAssignments.teamADates,
          start_time: recurringStart,
          end_time: recurringEnd,
          note: recurringNote.trim() || undefined,
        });
      }
      if (recurringAssignments.teamBStaff.length > 0 && recurringAssignments.teamBDates.length > 0) {
        await batchCreateVenueWorkShifts(venueId, {
          staff_ids: recurringAssignments.teamBStaff,
          dates: recurringAssignments.teamBDates,
          start_time: recurringStart,
          end_time: recurringEnd,
          note: recurringNote.trim() || undefined,
        });
      }
      setIsRecurringModalOpen(false);
    }, locale === "ro"
      ? `Program stabil generat: ${recurringAssignments.availableSlots} ture`
      : locale === "en"
      ? `Recurring schedule generated: ${recurringAssignments.availableSlots} shifts`
      : `Сгенерирован стабильный график: ${recurringAssignments.availableSlots} смен`);
  }

  async function handleCopyWeekConfirm() {
    await run(async () => {
      const res = await copyVenueWorkShiftsWeek(venueId, {
        source_start_date: prevWeekStart,
        target_start_date: currentWeekStart,
      });
      setIsCopyWeekModalOpen(false);
      void res;
    }, locale === "ro"
      ? "Programul săptămânii trecute a fost copiat"
      : locale === "en"
      ? "Previous week's schedule copied"
      : "График с прошлой недели успешно скопирован");
  }

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
      if (inspectingShift?.id === shiftToDelete.id) setInspectingShift(null);
    }, locale === "ro" ? "Tura a fost ștearsă" : locale === "en" ? "Shift deleted" : "Смена удалена");
  }

  const formattedDayTitle = useMemo(() => {
    try {
      const d = new Date(selectedDate + "T00:00:00");
      const lang = locale === "ro" ? "ro-RO" : locale === "en" ? "en-US" : "ru-RU";
      return d.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch {
      return selectedDate;
    }
  }, [selectedDate, locale]);

  const rosterGroups = useMemo(() => {
    const groups: { key: "waiter" | "cook"; title: string; icon: string; members: StaffMember[] }[] = [];
    if (roleFilter === "all" || roleFilter === "waiter") {
      groups.push({ key: "waiter", title: copy.plannerWaiters, icon: "👤", members: waiters });
    }
    if (roleFilter === "all" || roleFilter === "cook") {
      groups.push({ key: "cook", title: copy.plannerCooks, icon: "👨‍🍳", members: cooks });
    }
    return groups;
  }, [roleFilter, waiters, cooks, copy.plannerWaiters, copy.plannerCooks]);

  function renderDayShiftCard(shift: WorkShift) {
    const duration = formatDurationMinutes(calcDurationMinutes(shift.start_time, shift.end_time), locale);
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

        {shift.note && <p className="cabinet-planner-card-note">📍 {shift.note}</p>}

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
  }

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

      {/* Global Attention Center (All upcoming SWAP_REQUESTED & DECLINED across all dates) */}
      {globalAlertedShifts.length > 0 && (
        <section className="cabinet-planner-swap-banner cabinet-planner-global-alerts" role="alert">
          <span className="cabinet-planner-swap-icon" aria-hidden="true">
            ⚠️
          </span>
          <div className="cabinet-planner-swap-info">
            <div className="cabinet-planner-alerts-head">
              <strong>
                {locale === "ro"
                  ? `Atenție: ${globalAlertedShifts.length} ture necesită înlocuire`
                  : locale === "en"
                  ? `Attention: ${globalAlertedShifts.length} shift(s) need replacement`
                  : `Требуют внимания: ${globalAlertedShifts.length} смен(ы)`}
              </strong>
            </div>
            {globalAlertedShifts.map((shift) => (
              <div key={shift.id} className="cabinet-planner-swap-row">
                <div className="cabinet-planner-swap-meta">
                  <span className="cabinet-planner-alert-date">
                    {formatShortShiftDate(shift.date, todayStr, locale)}
                  </span>
                  <span className="cabinet-planner-swap-name">{shift.staff_name}</span>
                  <span className={`cabinet-staff-role-tag role-${shift.role || "waiter"}`}>
                    {shift.role === "cook" ? copy.opsStaffRoleCook : copy.opsStaffRoleWaiter}
                  </span>
                  <span className="cabinet-planner-swap-hours">
                    {shift.start_time} – {shift.end_time}
                  </span>
                  {shift.reason ? (
                    <span className="cabinet-planner-swap-reason">— «{shift.reason}»</span>
                  ) : (
                    <span className="cabinet-planner-swap-reason">
                      — {shift.status === "DECLINED" ? copy.opsScheduleDeclined : copy.staffSwapStatusBadge}
                    </span>
                  )}
                </div>
                <div className="cabinet-planner-swap-row-actions">
                  <button
                    type="button"
                    className="panel-btn primary sm cabinet-planner-swap-action-btn"
                    onClick={() => openSwapModal(shift)}
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
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Planner Card */}
      <section className="owner-card cabinet-ops-card cabinet-planner-card">
        {/* Header with Title & Action Bar */}
        <div className="owner-card-head cabinet-planner-head">
          <div>
            <span className="owner-kicker">{copy.shifts}</span>
            <h3>
              {viewMode === "matrix"
                ? (locale === "ro"
                    ? "Tabel ture pe angajați"
                    : locale === "en"
                    ? "Weekly staff schedule"
                    : "График смен персонала")
                : copy.plannerTitle}
            </h3>
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
            <button
              type="button"
              className="panel-btn ghost cabinet-planner-copy-btn"
              disabled={prevWeekCopyableCount === 0}
              title={
                prevWeekCopyableCount === 0
                  ? (locale === "ro" ? "Nu există ture săptămâna trecută" : "На прошлой неделе не было смен")
                  : undefined
              }
              onClick={() => setIsCopyWeekModalOpen(true)}
            >
              📋 {locale === "ro" ? "Copiază săpt. trecută" : locale === "en" ? "Copy last week" : "Скопировать прошлую неделю"}
            </button>
          </div>
        </div>

        {/* Toolbar: View Mode Toggle + Week Navigator + Role Filter */}
        <div className="cabinet-planner-toolbar">
          <div className="cabinet-planner-view-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "matrix"}
              className={`cabinet-planner-view-tab ${viewMode === "matrix" ? "active" : ""}`}
              onClick={() => setViewMode("matrix")}
            >
              {locale === "ro" ? "Tabel personal (săptămână)" : locale === "en" ? "Staff Grid (Week)" : "Сетка персонала (неделя)"}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "day"}
              className={`cabinet-planner-view-tab ${viewMode === "day" ? "active" : ""}`}
              onClick={() => setViewMode("day")}
            >
              {locale === "ro" ? "Detaliu pe zi" : locale === "en" ? "Day Breakdown" : "Подробно по дням"}
            </button>
          </div>

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
              {weekRangeLabel || copy.plannerToday}
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

          {viewMode === "matrix" && (
            <div className="cabinet-planner-role-filter" role="group">
              {(["all", "waiter", "cook"] as const).map((rf) => (
                <button
                  key={rf}
                  type="button"
                  className={roleFilter === rf ? "active" : ""}
                  onClick={() => setRoleFilter(rf)}
                >
                  {rf === "all"
                    ? `${copy.opsScheduleTabAll} (${staff.length})`
                    : rf === "waiter"
                    ? `${copy.opsScheduleTabWaiters} (${waiters.length})`
                    : `${copy.opsScheduleTabCooks} (${cooks.length})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* MODE 1: WEEKLY STAFF ROSTER MATRIX */}
        {viewMode === "matrix" && (
          <div className="cabinet-roster-matrix-wrap">
            {staff.length === 0 ? (
              <div className="cabinet-planner-col-empty">
                <p>
                  {locale === "ro"
                    ? "Adăugați ospătari sau bucătari în fila Personal pentru a planifica turele."
                    : locale === "en"
                    ? "Add waiters or cooks in the Staff tab to schedule shifts."
                    : "Добавьте официантов или поваров во вкладке «Персонал», чтобы планировать смены."}
                </p>
              </div>
            ) : (
              <table className="cabinet-roster-table">
                <thead>
                  <tr>
                    <th className="cabinet-roster-sticky-col cabinet-roster-th-staff">
                      {locale === "ro" ? "Angajat" : locale === "en" ? "Staff member" : "Сотрудник"}
                    </th>
                    {weekDays.map((d) => {
                      const activeWaiters = shifts.filter(
                        (s) => s.date === d.date && (s.role || "waiter") === "waiter" && s.status !== "DECLINED",
                      ).length;
                      const activeCooks = shifts.filter(
                        (s) => s.date === d.date && s.role === "cook" && s.status !== "DECLINED",
                      ).length;
                      const lowCoverage = activeWaiters === 0 || activeCooks === 0;

                      return (
                        <th
                          key={d.date}
                          className={`cabinet-roster-th-day ${d.isToday ? "today" : ""}`}
                        >
                          <button
                            type="button"
                            className="cabinet-roster-day-head-btn"
                            title={locale === "ro" ? "Deschide detaliul zilei" : "Открыть подробности дня"}
                            onClick={() => {
                              setSelectedDate(d.date);
                              setViewMode("day");
                            }}
                          >
                            <span className="cabinet-roster-day-name">
                              {d.dayName} {d.dayNum}
                            </span>
                            <span className={`cabinet-roster-coverage ${lowCoverage ? "low" : ""}`}>
                              👤{activeWaiters} · 👨‍🍳{activeCooks}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rosterGroups.map((group) => (
                    <RosterGroupRows
                      key={group.key}
                      group={group}
                      weekDays={weekDays}
                      shiftCellMap={shiftCellMap}
                      staffWeekStats={staffWeekStats}
                      locale={locale}
                      onFocusStaff={setFocusedStaff}
                      onInspectShift={setInspectingShift}
                      onQuickAdd={openQuickCellModal}
                    />
                  ))}
                </tbody>
              </table>
            )}

            <div className="cabinet-roster-legend">
              <span><i className="legend-dot confirmed" /> {copy.opsScheduleConfirmed}</span>
              <span><i className="legend-dot pending" /> {copy.opsSchedulePending}</span>
              <span><i className="legend-dot swap_requested" /> {copy.staffSwapStatusBadge}</span>
              <span><i className="legend-dot declined" /> {copy.opsScheduleDeclined}</span>
              <span className="cabinet-roster-legend-tip">
                {locale === "ro"
                  ? "Sfat: apăsați pe un angajat pentru graficul individual sau pe + pentru a adăuga rapid o tură"
                  : locale === "en"
                  ? "Tip: click a staff member for personal schedule, or + in any cell to assign quickly"
                  : "Подсказка: нажмите на имя сотрудника для его личного графика или на + в ячейке для быстрого назначения"}
              </span>
            </div>
          </div>
        )}

        {/* MODE 2: DAY-BY-DAY DETAILED VIEW */}
        {viewMode === "day" && (
          <>
            <div className="cabinet-planner-week-strip">
              <div className="cabinet-planner-days-grid" role="tablist">
                {weekDays.map((d) => {
                  const countWaiters = shifts.filter(
                    (s) => s.date === d.date && (s.role || "waiter") === "waiter" && s.status !== "DECLINED",
                  ).length;
                  const countCooks = shifts.filter(
                    (s) => s.date === d.date && s.role === "cook" && s.status !== "DECLINED",
                  ).length;
                  const hasAlert = shifts.some(
                    (s) => s.date === d.date && (s.status === "SWAP_REQUESTED" || s.status === "DECLINED"),
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

            <div className="cabinet-planner-columns">
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
                    <button type="button" className="panel-btn ghost sm" onClick={openBatchModal}>
                      + {copy.plannerAssignForDay}
                    </button>
                  </div>
                ) : (
                  <ul className="cabinet-planner-cards-list">
                    {dayWaiters.map((s) => renderDayShiftCard(s))}
                  </ul>
                )}
              </div>

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
                    <button type="button" className="panel-btn ghost sm" onClick={openBatchModal}>
                      + {copy.plannerAssignForDay}
                    </button>
                  </div>
                ) : (
                  <ul className="cabinet-planner-cards-list">
                    {dayCooks.map((s) => renderDayShiftCard(s))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
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

                <div className="cabinet-shift-field-group">
                  <label>{copy.opsSchedulePresetsTitle}</label>
                  <div className="cabinet-shift-preset-buttons">
                    <button
                      type="button"
                      className={`cabinet-shift-preset-pill ${batchStart === "08:00" && batchEnd === "16:00" ? "active" : ""}`}
                      onClick={() => { setBatchStart("08:00"); setBatchEnd("16:00"); }}
                    >
                      {copy.opsSchedulePresetMorning}
                    </button>
                    <button
                      type="button"
                      className={`cabinet-shift-preset-pill ${batchStart === "10:00" && batchEnd === "22:00" ? "active" : ""}`}
                      onClick={() => { setBatchStart("10:00"); setBatchEnd("22:00"); }}
                    >
                      {copy.opsSchedulePresetDay}
                    </button>
                    <button
                      type="button"
                      className={`cabinet-shift-preset-pill ${batchStart === "14:00" && batchEnd === "23:00" ? "active" : ""}`}
                      onClick={() => { setBatchStart("14:00"); setBatchEnd("23:00"); }}
                    >
                      {copy.opsSchedulePresetEvening}
                    </button>
                  </div>
                </div>

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

      {/* Modal 2: Quick 1-Cell Assign (from clicking + in matrix or Personal Schedule) */}
      {quickCell && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-shift-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setQuickCell(null)}
          />
          <section
            ref={quickModalRef}
            className="booking-popup cabinet-shift-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-quick-shift-title"
          >
            <div className="booking-popup-card cabinet-shift-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setQuickCell(null)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>

              <h3 id="cabinet-quick-shift-title">
                {locale === "ro"
                  ? "Programare rapidă tură"
                  : locale === "en"
                  ? "Quick shift assignment"
                  : "Быстрое назначение смены"}
              </h3>
              <p className="cabinet-shift-dialog-sub">
                {quickCell.member.name?.trim() || quickCell.member.email} ·{" "}
                {quickCell.member.role === "cook" ? copy.opsStaffRoleCook : copy.opsStaffRoleWaiter}
              </p>

              <form className="cabinet-shift-form" onSubmit={handleQuickCellSubmit}>
                <div className="cabinet-shift-field-group">
                  <label htmlFor="quick-date">{copy.opsScheduleDateLabel}</label>
                  <input
                    id="quick-date"
                    type="date"
                    required
                    value={quickDate}
                    onChange={(e) => setQuickDate(e.target.value)}
                    className="cabinet-shift-input"
                  />
                </div>

                <div className="cabinet-shift-field-group">
                  <label>{copy.opsSchedulePresetsTitle}</label>
                  <div className="cabinet-shift-preset-buttons">
                    <button
                      type="button"
                      className={`cabinet-shift-preset-pill ${quickStart === "08:00" && quickEnd === "16:00" ? "active" : ""}`}
                      onClick={() => { setQuickStart("08:00"); setQuickEnd("16:00"); }}
                    >
                      {copy.opsSchedulePresetMorning}
                    </button>
                    <button
                      type="button"
                      className={`cabinet-shift-preset-pill ${quickStart === "10:00" && quickEnd === "22:00" ? "active" : ""}`}
                      onClick={() => { setQuickStart("10:00"); setQuickEnd("22:00"); }}
                    >
                      {copy.opsSchedulePresetDay}
                    </button>
                    <button
                      type="button"
                      className={`cabinet-shift-preset-pill ${quickStart === "14:00" && quickEnd === "23:00" ? "active" : ""}`}
                      onClick={() => { setQuickStart("14:00"); setQuickEnd("23:00"); }}
                    >
                      {copy.opsSchedulePresetEvening}
                    </button>
                  </div>
                </div>

                <div className="cabinet-shift-time-row">
                  <div className="cabinet-shift-field-group">
                    <label htmlFor="quick-start">{copy.opsScheduleTimeStart}</label>
                    <input
                      id="quick-start"
                      type="time"
                      required
                      value={quickStart}
                      onChange={(e) => setQuickStart(e.target.value)}
                      className="cabinet-shift-input"
                    />
                  </div>
                  <div className="cabinet-shift-field-group">
                    <label htmlFor="quick-end">{copy.opsScheduleTimeEnd}</label>
                    <input
                      id="quick-end"
                      type="time"
                      required
                      value={quickEnd}
                      onChange={(e) => setQuickEnd(e.target.value)}
                      className="cabinet-shift-input"
                    />
                  </div>
                </div>

                {quickCellConflict && (
                  <div className="cabinet-quick-conflict-warning" role="alert">
                    ⚠️{" "}
                    {locale === "ro"
                      ? `Angajatul are deja o tură activă în acest interval: ${formatConflictLabel(quickCellConflict, locale)}`
                      : locale === "en"
                      ? `Staff member already has an active shift during this time: ${formatConflictLabel(quickCellConflict, locale)}`
                      : `У сотрудника уже есть активная смена на это время: ${formatConflictLabel(quickCellConflict, locale)}`}
                  </div>
                )}

                <div className="cabinet-shift-field-group">
                  <label htmlFor="quick-note">{copy.opsScheduleNoteLabel}</label>
                  <input
                    id="quick-note"
                    type="text"
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder={copy.opsScheduleNotePlaceholder}
                    className="cabinet-shift-input"
                  />
                </div>

                <div className="cabinet-shift-actions">
                  <button
                    type="submit"
                    className="panel-btn primary"
                    disabled={busy || !!quickCellConflict}
                  >
                    {copy.opsScheduleSubmitBtn}
                  </button>
                  <button
                    type="button"
                    className="panel-btn ghost"
                    disabled={busy}
                    onClick={() => setQuickCell(null)}
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

      {/* Modal 3: Recurring Schedule Generator with 2/2 Team Waves */}
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
                  ? "Generați automat ture pentru echipe pe săptămâni înainte"
                  : locale === "en"
                  ? "Automatically generate shifts for your team weeks ahead"
                  : "Автоматическая генерация графика для команд на период вперед"}
              </p>

              <form className="cabinet-shift-form" onSubmit={handleRecurringSubmit}>
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

                {recurringPattern === "2/2" ? (
                  <div className="cabinet-shift-field-group">
                    <label>
                      {locale === "ro"
                        ? "Alternare echipe 2/2"
                        : locale === "en"
                        ? "2/2 team rotation"
                        : "Распределение смен 2/2"}
                    </label>
                    <div className="cabinet-wave-selector">
                      <button
                        type="button"
                        className={`cabinet-wave-btn ${recurringWaveMode === "alternate" ? "active" : ""}`}
                        onClick={() => setRecurringWaveMode("alternate")}
                      >
                        <strong>{locale === "ro" ? "Alternare A + B" : locale === "en" ? "Auto-split A + B" : "Авто-чередование А + Б"}</strong>
                        <small>{locale === "ro" ? "Acoperire zilnică 50/50" : locale === "en" ? "50/50 daily coverage" : "Половина А, половина Б — зал всегда закрыт"}</small>
                      </button>
                      <button
                        type="button"
                        className={`cabinet-wave-btn ${recurringWaveMode === "team_a" ? "active" : ""}`}
                        onClick={() => setRecurringWaveMode("team_a")}
                      >
                        <strong>{locale === "ro" ? "Echipa A" : locale === "en" ? "Team A" : "Волна А"}</strong>
                        <small>{locale === "ro" ? "Lucrează zilele 1–2" : locale === "en" ? "Starts day 1–2" : "Работает с 1-го дня"}</small>
                      </button>
                      <button
                        type="button"
                        className={`cabinet-wave-btn ${recurringWaveMode === "team_b" ? "active" : ""}`}
                        onClick={() => setRecurringWaveMode("team_b")}
                      >
                        <strong>{locale === "ro" ? "Echipa B (+2 zile)" : locale === "en" ? "Team B (+2 days)" : "Волна Б (+2 дня)"}</strong>
                        <small>{locale === "ro" ? "Lucrează zilele 3–4" : locale === "en" ? "Starts day 3–4" : "Сдвиг на 2 дня"}</small>
                      </button>
                    </div>
                  </div>
                ) : (
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

                {recurringStaffIds.length > 0 && (
                  <div className="cabinet-recurring-preview">
                    <span>
                      {locale === "ro"
                        ? `Vor fi create: ${recurringAssignments.availableSlots} ture`
                        : locale === "en"
                        ? `Shifts to create: ${recurringAssignments.availableSlots}`
                        : `Будет создано смен: ${recurringAssignments.availableSlots}`}
                    </span>
                    {recurringAssignments.conflictSlots > 0 && (
                      <small className="cabinet-recurring-skipped">
                        {locale === "ro"
                          ? ` (${recurringAssignments.conflictSlots} omise din cauza suprapunerilor)`
                          : locale === "en"
                          ? ` (${recurringAssignments.conflictSlots} skipped due to existing shifts)`
                          : ` (${recurringAssignments.conflictSlots} пропущено — уже назначены/ожидают)`}
                      </small>
                    )}
                  </div>
                )}

                <div className="cabinet-shift-actions">
                  <button
                    type="submit"
                    className="panel-btn primary"
                    disabled={busy || recurringStaffIds.length === 0 || recurringAssignments.availableSlots === 0}
                  >
                    ⚡ {copy.plannerGenerateBtn} ({recurringAssignments.availableSlots})
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

      {/* Modal 4: Personal Schedule Modal for Selected Employee */}
      {focusedStaff && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-shift-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setFocusedStaff(null)}
          />
          <section
            ref={personalModalRef}
            className="booking-popup cabinet-shift-dialog cabinet-personal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-personal-schedule-title"
          >
            <div className="booking-popup-card cabinet-shift-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setFocusedStaff(null)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>

              <div className="cabinet-personal-head">
                <span className="cabinet-staff-avatar" aria-hidden="true">
                  {(focusedStaff.name?.trim() || focusedStaff.email).slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h3 id="cabinet-personal-schedule-title">
                    {focusedStaff.name?.trim() || focusedStaff.email}
                  </h3>
                  <p className="cabinet-shift-dialog-sub">
                    {focusedStaff.role === "cook" ? copy.opsStaffRoleCook : copy.opsStaffRoleWaiter} · {focusedStaff.email}
                  </p>
                </div>
              </div>

              <div className="cabinet-personal-stats">
                <div>
                  <span>{copy.opsScheduleConfirmed}</span>
                  <strong>{focusedStaffStats.confirmed}</strong>
                </div>
                <div>
                  <span>{copy.opsSchedulePending}</span>
                  <strong>{focusedStaffStats.pending}</strong>
                </div>
                <div>
                  <span>{locale === "ro" ? "Total ore" : locale === "en" ? "Total hours" : "Всего часов"}</span>
                  <strong>{formatHoursCompact(focusedStaffStats.totalMinutes, locale)}</strong>
                </div>
              </div>

              <div className="cabinet-personal-toolbar">
                <strong>
                  {locale === "ro"
                    ? "Toate turele programate"
                    : locale === "en"
                    ? "Assigned shifts"
                    : "График смен сотрудника"}
                </strong>
                <button
                  type="button"
                  className="panel-btn primary sm"
                  onClick={() => {
                    const m = focusedStaff;
                    setFocusedStaff(null);
                    openQuickCellModal(m, selectedDate);
                  }}
                >
                  + {copy.opsScheduleAddBtn}
                </button>
              </div>

              {focusedStaffShifts.length === 0 ? (
                <p className="cabinet-swap-empty-note">
                  {locale === "ro"
                    ? "Acest angajat nu are ture programate."
                    : locale === "en"
                    ? "No shifts assigned to this employee."
                    : "У сотрудника пока нет назначенных смен."}
                </p>
              ) : (
                <ul className="cabinet-personal-shifts-list">
                  {focusedStaffShifts.map((s) => (
                    <li key={s.id} className={`cabinet-personal-shift-row status-${s.status.toLowerCase()}`}>
                      <div>
                        <strong>
                          {formatShortShiftDate(s.date, todayStr, locale)} · {s.start_time} – {s.end_time}
                        </strong>
                        {s.note && <small>📍 {s.note}</small>}
                        {s.reason && <small className="reason">⚠️ {s.reason}</small>}
                      </div>
                      <div className="cabinet-personal-shift-actions">
                        <span className={`cabinet-shift-status-badge ${s.status.toLowerCase()}`}>
                          {s.status === "CONFIRMED"
                            ? copy.opsScheduleConfirmed
                            : s.status === "SWAP_REQUESTED"
                            ? copy.staffSwapStatusBadge
                            : s.status === "DECLINED"
                            ? copy.opsScheduleDeclined
                            : copy.opsSchedulePending}
                        </span>
                        <button
                          type="button"
                          className="panel-btn ghost sm"
                          onClick={() => {
                            setFocusedStaff(null);
                            openSwapModal(s);
                          }}
                          title={copy.plannerSwapBtn}
                        >
                          ⇄
                        </button>
                        <button
                          type="button"
                          className="panel-btn ghost sm danger"
                          onClick={() => {
                            setFocusedStaff(null);
                            setDeletingShift(s);
                          }}
                          title={copy.opsScheduleDeleteBtn}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* Modal 5: Shift Quick Inspect / Action Modal (clicking shift cell in matrix) */}
      {inspectingShift && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-shift-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setInspectingShift(null)}
          />
          <section
            ref={inspectModalRef}
            className="booking-popup cabinet-shift-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-inspect-shift-title"
          >
            <div className="booking-popup-card cabinet-shift-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setInspectingShift(null)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>

              <h3 id="cabinet-inspect-shift-title">{inspectingShift.staff_name}</h3>
              <p className="cabinet-shift-dialog-sub">
                {formatShortShiftDate(inspectingShift.date, todayStr, locale)} ({inspectingShift.date})
              </p>

              <div className="cabinet-planner-swap-target-box">
                <div>
                  <strong>{inspectingShift.start_time} – {inspectingShift.end_time}</strong>
                  <span className={`cabinet-staff-role-tag role-${inspectingShift.role || "waiter"}`}>
                    {inspectingShift.role === "cook" ? copy.opsStaffRoleCook : copy.opsStaffRoleWaiter}
                  </span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <span className={`cabinet-shift-status-badge ${inspectingShift.status.toLowerCase()}`}>
                    {inspectingShift.status === "CONFIRMED"
                      ? copy.opsScheduleConfirmed
                      : inspectingShift.status === "SWAP_REQUESTED"
                      ? copy.staffSwapStatusBadge
                      : inspectingShift.status === "DECLINED"
                      ? copy.opsScheduleDeclined
                      : copy.opsSchedulePending}
                  </span>
                </div>
                {inspectingShift.note && (
                  <p className="cabinet-planner-card-note" style={{ marginTop: 8 }}>
                    📍 {inspectingShift.note}
                  </p>
                )}
                {inspectingShift.reason && (
                  <p className="cabinet-planner-swap-target-reason">
                    ⚠️ {inspectingShift.reason}
                  </p>
                )}
              </div>

              <div className="cabinet-shift-actions">
                <button
                  type="button"
                  className="panel-btn primary"
                  onClick={() => openSwapModal(inspectingShift)}
                >
                  ⇄ {copy.plannerSwapBtn}
                </button>
                <button
                  type="button"
                  className="panel-btn ghost danger"
                  onClick={() => {
                    const target = inspectingShift;
                    setInspectingShift(null);
                    setDeletingShift(target);
                  }}
                >
                  {locale === "ro" ? "Șterge tura" : locale === "en" ? "Delete shift" : "Удалить смену"}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* Modal 6: Copy Previous Week Confirmation */}
      {isCopyWeekModalOpen && typeof document !== "undefined" && createPortal(
        <div className="booking-popup-root cabinet-delete-modal-root" role="presentation">
          <button
            type="button"
            className="booking-popup-backdrop"
            aria-label={copy.opsMenuCancel}
            onClick={() => setIsCopyWeekModalOpen(false)}
          />
          <section
            ref={copyWeekModalRef}
            className="booking-popup cabinet-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cabinet-copy-week-title"
          >
            <div className="booking-popup-card cabinet-delete-card">
              <button
                type="button"
                className="booking-popup-x"
                onClick={() => setIsCopyWeekModalOpen(false)}
                aria-label={copy.opsMenuCancel}
              >
                ×
              </button>
              <div className="cabinet-copy-icon" aria-hidden="true">📋</div>
              <h3 id="cabinet-copy-week-title">
                {locale === "ro"
                  ? "Copiați programul săptămânii trecute?"
                  : locale === "en"
                  ? "Copy previous week's schedule?"
                  : "Скопировать график прошлой недели?"}
              </h3>
              <p className="cabinet-delete-text">
                {locale === "ro"
                  ? `Vor fi copiate până la ${prevWeekCopyableCount} ture din săptămâna anterioară în săptămâna curentă (${weekRangeLabel}). Conflictele existente vor fi omise automat.`
                  : locale === "en"
                  ? `Up to ${prevWeekCopyableCount} shift(s) from last week will be copied into ${weekRangeLabel}. Existing overlapping shifts will be skipped automatically.`
                  : `Будет перенесено до ${prevWeekCopyableCount} смен с прошлой недели на выбранную (${weekRangeLabel}). Уже занятые слоты будут автоматически пропущены.`}
              </p>
              <div className="cabinet-delete-actions">
                <button
                  type="button"
                  className="panel-btn primary"
                  disabled={busy}
                  onClick={() => void handleCopyWeekConfirm()}
                >
                  {locale === "ro" ? "Copiază programul" : locale === "en" ? "Copy schedule" : "Скопировать"}
                </button>
                <button
                  type="button"
                  className="panel-btn ghost"
                  disabled={busy}
                  onClick={() => setIsCopyWeekModalOpen(false)}
                >
                  {copy.opsMenuCancel}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* Modal 7: Swap Staff Member on Shift (Direct List of Free Candidates) */}
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

      {/* Modal 8: Custom Delete Shift Confirmation Popup */}
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

function RosterGroupRows({
  group,
  weekDays,
  shiftCellMap,
  staffWeekStats,
  locale,
  onFocusStaff,
  onInspectShift,
  onQuickAdd,
}: {
  group: { key: "waiter" | "cook"; title: string; icon: string; members: StaffMember[] };
  weekDays: { date: string; isToday: boolean }[];
  shiftCellMap: Map<string, WorkShift[]>;
  staffWeekStats: Map<string, { shiftCount: number; totalMinutes: number }>;
  locale: "ru" | "ro" | "en";
  onFocusStaff: (member: StaffMember) => void;
  onInspectShift: (shift: WorkShift) => void;
  onQuickAdd: (member: StaffMember, date: string) => void;
}) {
  if (group.members.length === 0) return null;

  return (
    <>
      <tr className="cabinet-roster-group-row">
        <th colSpan={weekDays.length + 1} scope="colgroup" className="cabinet-roster-group-head">
          <span>{group.icon}</span> {group.title} ({group.members.length})
        </th>
      </tr>
      {group.members.map((member) => {
        const displayName = member.name?.trim() || member.email.split("@")[0];
        const stats = staffWeekStats.get(member.id);

        return (
          <tr key={member.id} className="cabinet-roster-staff-row">
            <th scope="row" className="cabinet-roster-sticky-col cabinet-roster-staff-cell">
              <button
                type="button"
                className="cabinet-roster-staff-btn"
                onClick={() => onFocusStaff(member)}
                title={locale === "ro" ? "Vezi graficul angajatului" : locale === "en" ? "View personal schedule" : "Открыть график сотрудника"}
              >
                <span className="cabinet-staff-avatar xs" aria-hidden="true">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
                <div className="cabinet-roster-staff-meta">
                  <strong>{displayName}</strong>
                  <small>
                    {stats && stats.shiftCount > 0
                      ? `${stats.shiftCount} ${locale === "ro" ? "ture" : locale === "en" ? "sh" : "см"} · ${formatHoursCompact(stats.totalMinutes, locale)}`
                      : (locale === "ro" ? "Liber" : locale === "en" ? "Off" : "Выходной")}
                  </small>
                </div>
              </button>
            </th>

            {weekDays.map((d) => {
              const cellShifts = shiftCellMap.get(`${member.id}::${d.date}`) || [];
              const hasActiveShift = cellShifts.some(
                (s) => s.status === "CONFIRMED" || s.status === "PENDING",
              );

              return (
                <td key={d.date} className={`cabinet-roster-day-cell ${d.isToday ? "today" : ""}`}>
                  <div className="cabinet-roster-cell-inner">
                    {cellShifts.map((shift) => (
                      <button
                        key={shift.id}
                        type="button"
                        className={`cabinet-roster-shift-chip status-${shift.status.toLowerCase()}`}
                        onClick={() => onInspectShift(shift)}
                        title={shift.note || shift.reason || undefined}
                      >
                        <span className="chip-icon" aria-hidden="true">
                          {shift.status === "CONFIRMED"
                            ? "✓"
                            : shift.status === "PENDING"
                            ? "⏳"
                            : shift.status === "SWAP_REQUESTED"
                            ? "⚠️"
                            : "✕"}
                        </span>
                        <span className="chip-hours">
                          {shift.start_time}–{shift.end_time}
                        </span>
                      </button>
                    ))}
                    {!hasActiveShift && (
                      <button
                        type="button"
                        className="cabinet-roster-cell-add"
                        onClick={() => onQuickAdd(member, d.date)}
                        aria-label={`${displayName} ${d.date}`}
                        title={locale === "ro" ? "Adaugă tură" : locale === "en" ? "Assign shift" : "Назначить смену"}
                      >
                        +
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
