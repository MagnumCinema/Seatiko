// Work shift rules, ported from store/ops.go; dates and times are also validated
// (Go only checked presence, see PLAN.md "Go gaps").

/** "HH:MM" → minutes from midnight, or undefined. */
export function shiftMinutes(hhmm: string): number | undefined {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : undefined;
}

/** A real calendar date "YYYY-MM-DD". */
export function validDate(d: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]);
}

/** Do two shifts of one day overlap? An end at or before the start runs past midnight; bad times count as overlap. */
export function shiftsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const s1 = shiftMinutes(startA);
  let e1 = shiftMinutes(endA);
  const s2 = shiftMinutes(startB);
  let e2 = shiftMinutes(endB);
  if (s1 === undefined || e1 === undefined || s2 === undefined || e2 === undefined) return true;
  if (e1 <= s1) e1 += 24 * 60;
  if (e2 <= s2) e2 += 24 * 60;
  return s1 < e2 && s2 < e1;
}

/** Date `days` after a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
export const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const SHIFT_RESPONSES = ['CONFIRMED', 'DECLINED', 'SWAP_REQUESTED'];
export const STAFF_ROLES = ['waiter', 'cook'];
