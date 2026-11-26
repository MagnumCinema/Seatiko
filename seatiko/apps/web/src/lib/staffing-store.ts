/**
 * Minimum staffing per role, kept in this browser until the API stores it with the role
 * (BACKEND_TASKS №31). Per venue: { [roleKey]: StaffingRule[] }.
 */
import { ALL_WEEKDAYS, parseTime, STAFFING_MAX, type StaffingByRole, type StaffingRule } from "@/lib/shift-schedule";

const PREFIX = "seatiko:staffing:";
export const STAFFING_EVENT = "seatiko:staffing-change";
/** A role keeps at most this many rules. */
export const MAX_RULES_PER_ROLE = 6;

const time = (v: unknown) => (typeof v === "string" && parseTime(v) !== null ? v : undefined);

/** Drops anything malformed so a broken or old value never breaks the planner. */
export function sanitizeRules(raw: unknown): StaffingRule[] {
  if (!Array.isArray(raw)) return [];
  const out: StaffingRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const days = Array.isArray(r.days)
      ? [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7))].sort()
      : [];
    const min = Number.isInteger(r.min) ? Math.min(STAFFING_MAX, Math.max(0, r.min as number)) : 0;
    if (!days.length || min < 1) continue;
    const from = time(r.from);
    const to = time(r.to);
    const window = from && to && from !== to ? { from, to } : {};
    out.push({ id: typeof r.id === "string" && r.id ? r.id : newRuleId(), days, min, ...window });
    if (out.length >= MAX_RULES_PER_ROLE) break;
  }
  return out;
}

export function sanitizeStaffing(raw: unknown): StaffingByRole {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StaffingByRole = {};
  for (const [key, rules] of Object.entries(raw as Record<string, unknown>)) {
    const clean = sanitizeRules(rules);
    if (clean.length) out[key] = clean;
  }
  return out;
}

export function readStaffing(venueId: string): StaffingByRole {
  if (!venueId || typeof window === "undefined") return {};
  try {
    return sanitizeStaffing(JSON.parse(window.localStorage.getItem(PREFIX + venueId) || "{}"));
  } catch {
    return {};
  }
}

/** Saves one role's rules; returns false when the browser does not keep data (private mode). */
export function writeRoleStaffing(venueId: string, roleKey: string, rules: StaffingRule[]): boolean {
  if (!venueId || typeof window === "undefined") return false;
  const next = readStaffing(venueId);
  const clean = sanitizeRules(rules);
  if (clean.length) next[roleKey] = clean;
  else delete next[roleKey];
  try {
    window.localStorage.setItem(PREFIX + venueId, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(STAFFING_EVENT, { detail: { venueId } }));
    return true;
  } catch {
    return false;
  }
}

let counter = 0;
export function newRuleId(): string {
  counter += 1;
  return `r${Date.now().toString(36)}${counter.toString(36)}`;
}

export const defaultRule = (): StaffingRule => ({ id: newRuleId(), days: [...ALL_WEEKDAYS], min: 1 });
