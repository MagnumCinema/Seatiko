import type { StaffMember, VenueRole, WorkShift } from "@/lib/api";
import { normalizeSearch } from "@/lib/cabinet-bookings";
import { plannerRoles, sortRoles } from "@/lib/venue-roles";

/**
 * Team list of the owner cabinet («Сотрудники»): names, invite checks, filters and the
 * two flows that work around the missing invite acceptance (BACKEND_TASKS №15).
 * Pure functions, no React.
 */

/** The member's name, else the part of the email before "@". */
export function memberName(m: Pick<StaffMember, "name" | "email">): string {
  return m.name?.trim() || m.email.split("@")[0] || m.email;
}

/** "MB" for Marco Bellini, "АН" for Анна, "AR" for alex.rusu@… */
export function memberInitials(m: Pick<StaffMember, "name" | "email">): string {
  const words = memberName(m)
    .split(/[\s._-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function findMemberByEmail(staff: StaffMember[], email: string): StaffMember | undefined {
  const target = normalizeEmail(email);
  return staff.find((m) => normalizeEmail(m.email) === target);
}

export type InviteProblem = "empty" | "invalid" | "duplicate";

/** Why an invite cannot be sent yet (the API itself would accept a second copy of a teammate). */
export function inviteProblem(email: string, staff: StaffMember[]): InviteProblem | null {
  if (!email.trim()) return "empty";
  if (!isValidEmail(email)) return "invalid";
  if (findMemberByEmail(staff, email)) return "duplicate";
  return null;
}

export type MemberStatus = "invited" | "on_shift" | "active" | "revoked";

export function memberStatus(m: Pick<StaffMember, "status" | "on_shift">): MemberStatus {
  if (m.status === "INVITED") return "invited";
  if (m.status === "REVOKED") return "revoked";
  return m.on_shift ? "on_shift" : "active";
}

export type TeamCounts = { all: number; onShift: number; invited: number };

export function teamCounts(staff: StaffMember[]): TeamCounts {
  let onShift = 0;
  let invited = 0;
  for (const m of staff) {
    const status = memberStatus(m);
    if (status === "on_shift") onShift++;
    if (status === "invited") invited++;
  }
  return { all: staff.length, onShift, invited };
}

export type TeamStatusFilter = "all" | "on_shift" | "invited";
export type TeamFilters = { query: string; role: string; status: TeamStatusFilter };

/** Every word of the query must appear in the name or the email (no case, no diacritics). */
export function filterTeam(staff: StaffMember[], filters: TeamFilters): StaffMember[] {
  const words = normalizeSearch(filters.query).split(/\s+/).filter(Boolean);
  return staff.filter((m) => {
    if (filters.role !== "all" && m.role !== filters.role) return false;
    if (filters.status !== "all" && memberStatus(m) !== filters.status) return false;
    if (!words.length) return true;
    const haystack = normalizeSearch(`${m.name ?? ""} ${m.email}`);
    return words.every((w) => haystack.includes(w));
  });
}

/** Team order of the API: the venue's role order, then name; members of unknown roles last. */
export function sortTeam(staff: StaffMember[], roles: VenueRole[]): StaffMember[] {
  const order = new Map(sortRoles(roles).map((r, i) => [r.key, i]));
  const pos = (key: string) => order.get(key) ?? Number.MAX_SAFE_INTEGER;
  return [...staff].sort(
    (a, b) =>
      pos(a.role) - pos(b.role) ||
      a.role.localeCompare(b.role) ||
      (a.name ?? "").localeCompare(b.name ?? "") ||
      a.id.localeCompare(b.id),
  );
}

/** "{name}: {count}" with values; unknown placeholders become empty. */
export const fillTemplate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** Role preselected in the invite form: waiter, else the first role of the schedule, else any. */
export function defaultInviteRole(roles: VenueRole[]): string {
  if (roles.some((r) => r.key === "waiter")) return "waiter";
  return (plannerRoles(roles)[0] ?? sortRoles(roles)[0])?.key ?? "";
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** The member's shifts on a venue day, earliest first; declined ones are not worked. */
export function shiftsToday(shifts: WorkShift[], staffId: string, day: string): WorkShift[] {
  return shifts
    .filter((s) => s.staff_id === staffId && s.date === day && s.status !== "DECLINED")
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/** Shifts still ahead of a member: later days, and today's shifts that have not started yet. */
export function upcomingShiftsOf(shifts: WorkShift[], staffId: string, today: string, nowMin: number): WorkShift[] {
  return shifts
    .filter(
      (s) => s.staff_id === staffId && (s.date > today || (s.date === today && minutesOf(s.start_time) > nowMin)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
}

/** The API calls the two flows below need (injected so the flows are testable). */
export type TeamApi = {
  invite: (email: string, name: string, role: string) => Promise<StaffMember>;
  remove: (staffId: string) => Promise<unknown>;
  swapShift: (shiftId: string, staffId: string) => Promise<unknown>;
  deleteShift: (shiftId: string) => Promise<unknown>;
};

export type RelinkResult =
  | { kind: "linked"; member: StaffMember; moved: number; failed: number }
  | { kind: "still_invited" };

/**
 * Nobody can accept an invite today, so an invited person stays INVITED even after signing
 * up. Inviting the same email again links an existing account at once: then the shifts still
 * ahead move to the new row and the old invite goes. Without an account the copy is dropped.
 */
export async function relinkInvite(api: TeamApi, invited: StaffMember, shiftsAhead: WorkShift[]): Promise<RelinkResult> {
  const created = await api.invite(invited.email, invited.name?.trim() ?? "", invited.role);
  if (created.status !== "ACTIVE") {
    await api.remove(created.id);
    return { kind: "still_invited" };
  }
  let moved = 0;
  let failed = 0;
  for (const s of shiftsAhead) {
    try {
      await api.swapShift(s.id, created.id);
      moved++;
    } catch {
      failed++;
    }
  }
  await api.remove(invited.id);
  return { kind: "linked", member: created, moved, failed };
}

/** Removes the member, then the shifts the owner chose to drop with them. */
export async function removeMember(
  api: TeamApi,
  m: StaffMember,
  shiftIds: string[],
): Promise<{ deletedShifts: number; failedShifts: number }> {
  await api.remove(m.id);
  let deletedShifts = 0;
  let failedShifts = 0;
  for (const id of shiftIds) {
    try {
      await api.deleteShift(id);
      deletedShifts++;
    } catch {
      failedShifts++;
    }
  }
  return { deletedShifts, failedShifts };
}
