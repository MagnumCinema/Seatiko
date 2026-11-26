import type { StaffMember, VenueRole, WorkShift } from "@/lib/api";
import { RESTAURANT_TYPE_IDS, type RestaurantTypeId } from "@/lib/discover-preferences";

/** Venue formats an owner can pick (same ids as the discover wizard and the API). */
export const VENUE_TYPE_IDS: RestaurantTypeId[] = RESTAURANT_TYPE_IDS;

export const isVenueTypeId = (value: string): value is RestaurantTypeId =>
  (VENUE_TYPE_IDS as string[]).includes(value);

/** Badge colours offered for roles (matches the API palette). */
export const ROLE_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#22c55e",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#ef4444",
  "#0ea5e9",
  "#a16207",
  "#64748b",
];

export const ROLE_NAME_MAX = 40;
const NEUTRAL_COLOR = "#64748b";

/** Translated names of preset role keys (waiter, barista…), from site-copy. */
export type PresetRoleNames = Record<string, string>;

type RoleLike = { key: string; name?: string };

/** Display name: the owner's name, else the translated preset name, else the key. */
export function roleLabel(role: RoleLike, presetNames: PresetRoleNames): string {
  return role.name?.trim() || presetNames[role.key] || role.key;
}

/** Name of a role key at a venue (falls back when the role row is unknown). */
export function roleNameByKey(key: string, roles: VenueRole[], presetNames: PresetRoleNames): string {
  const role = roles.find((r) => r.key === key);
  return roleLabel(role ?? { key }, presetNames);
}

/** Role of a shift as the API sends it (role_name / role_color). */
export function shiftRoleLabel(shift: Pick<WorkShift, "role" | "role_name">, presetNames: PresetRoleNames): string {
  return roleLabel({ key: shift.role, name: shift.role_name }, presetNames);
}

export function roleColor(key: string, roles: VenueRole[], fallback?: string): string {
  return roles.find((r) => r.key === key)?.color || fallback || NEUTRAL_COLOR;
}

export const sortRoles = (roles: VenueRole[]) =>
  [...roles].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));

/** Roles shown in the shift planner, in the owner's order. */
export const plannerRoles = (roles: VenueRole[]) => sortRoles(roles).filter((r) => r.in_schedule);

export type RoleGroup = { role: VenueRole; members: StaffMember[] };

/**
 * Team grouped by role (planner: only roles with in_schedule). Members whose role
 * the venue no longer has go to a trailing group named after their key.
 */
export function groupStaffByRole(
  staff: StaffMember[],
  roles: VenueRole[],
  opts: { inScheduleOnly?: boolean; includeEmpty?: boolean } = {},
): RoleGroup[] {
  const ordered = opts.inScheduleOnly ? plannerRoles(roles) : sortRoles(roles);
  const known = new Set(roles.map((r) => r.key));
  const groups: RoleGroup[] = ordered.map((role) => ({
    role,
    members: staff.filter((m) => m.role === role.key),
  }));
  const orphans = new Map<string, StaffMember[]>();
  for (const m of staff) {
    if (known.has(m.role)) continue;
    orphans.set(m.role, [...(orphans.get(m.role) ?? []), m]);
  }
  for (const [key, members] of orphans) {
    groups.push({
      role: {
        id: `orphan-${key}`,
        venue_id: members[0]?.venue_id ?? "",
        key,
        name: "",
        color: NEUTRAL_COLOR,
        in_schedule: true,
        position: Number.MAX_SAFE_INTEGER,
        is_system: false,
        permissions: [],
        created_at: "",
      },
      members,
    });
  }
  return opts.includeEmpty ? groups : groups.filter((g) => g.members.length > 0);
}

/** People (not shifts) of each role on shift on a date; declined shifts do not count. */
export function roleCoverage(shifts: WorkShift[], date: string, roleKeys: string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(roleKeys.map((k) => [k, 0]));
  const seen = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (s.date !== date || s.status === "DECLINED" || !(s.role in out)) continue;
    const people = seen.get(s.role) ?? new Set<string>();
    people.add(s.staff_id);
    seen.set(s.role, people);
  }
  for (const [key, people] of seen) out[key] = people.size;
  return out;
}

/** First palette colour no role uses yet. */
export function nextRoleColor(roles: VenueRole[]): string {
  const used = new Set(roles.map((r) => r.color.toLowerCase()));
  return ROLE_COLORS.find((c) => !used.has(c)) ?? ROLE_COLORS[roles.length % ROLE_COLORS.length];
}

/** Trimmed name or null when empty, too long, or taken by another role (case-insensitive). */
export function validRoleName(
  name: string,
  roles: VenueRole[],
  presetNames: PresetRoleNames,
  exceptId?: string,
): "empty" | "too_long" | "taken" | null {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return "empty";
  if (n.length > ROLE_NAME_MAX) return "too_long";
  const lower = n.toLowerCase();
  if (roles.some((r) => r.id !== exceptId && roleLabel(r, presetNames).toLowerCase() === lower)) return "taken";
  return null;
}

/** Why a role cannot simply be deleted: system roles never; roles in use need a replacement. */
export function deleteState(role: VenueRole, staff: StaffMember[]): { blocked: "system" | "in_use" | null; members: number } {
  const members = staff.filter((m) => m.role === role.key).length;
  if (role.is_system) return { blocked: "system", members };
  return { blocked: members > 0 ? "in_use" : null, members };
}
