// Staff time for the CRM, counted as the site's schedule does: declined shifts do not
// count, and a shift whose end is not after its start runs past midnight.
import { addDays, shiftMinutes } from '../../staff-team/domain/shift-rules.js';

export type ShiftForTime = { staffId: string; venueId: string; date: string; startTime: string; endTime: string; status: string };
export type StaffTime = { shiftsThisWeek: number; hoursThisWeek: number; hoursThisMonth: number };

/** Hours of one shift, to two decimals (0 when a time is malformed). */
export function shiftHours(startTime: string, endTime: string): number {
  const start = shiftMinutes(startTime);
  let end = shiftMinutes(endTime);
  if (start === undefined || end === undefined) return 0;
  if (end <= start) end += 24 * 60;
  return Math.round(((end - start) / 60) * 100) / 100;
}

/** Monday and Sunday (YYYY-MM-DD) of the week that holds `today`. */
export function weekOf(today: string): { from: string; to: string } {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const from = addDays(today, -((weekday + 6) % 7));
  return { from, to: addDays(from, 6) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Per staff member and per venue: this week (Mon–Sun) and this calendar month, around `today`. */
export function staffTime(shifts: ShiftForTime[], today: string): { byStaff: Map<string, StaffTime>; venueHoursThisWeek: Map<string, number> } {
  const week = weekOf(today);
  const month = today.slice(0, 7);
  const byStaff = new Map<string, StaffTime>();
  const venueHoursThisWeek = new Map<string, number>();
  for (const s of shifts) {
    if (!byStaff.has(s.staffId)) byStaff.set(s.staffId, { shiftsThisWeek: 0, hoursThisWeek: 0, hoursThisMonth: 0 });
    if (s.status === 'DECLINED') continue;
    const hours = shiftHours(s.startTime, s.endTime);
    const t = byStaff.get(s.staffId)!;
    if (s.date >= week.from && s.date <= week.to) {
      t.shiftsThisWeek += 1;
      t.hoursThisWeek = round(t.hoursThisWeek + hours);
      venueHoursThisWeek.set(s.venueId, round((venueHoursThisWeek.get(s.venueId) ?? 0) + hours));
    }
    if (s.date.startsWith(month)) t.hoursThisMonth = round(t.hoursThisMonth + hours);
  }
  return { byStaff, venueHoursThisWeek };
}
