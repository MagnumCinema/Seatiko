import { describe, expect, it } from "vitest";
import type { StaffMember, VenueRole } from "@/lib/api";
import {
  deleteState,
  groupStaffByRole,
  isVenueTypeId,
  nextRoleColor,
  plannerRoles,
  roleLabel,
  roleNameByKey,
  shiftRoleLabel,
  validRoleName,
  VENUE_TYPE_IDS,
} from "./venue-roles";

const names = { waiter: "Официант", cook: "Повар", barista: "Бариста" };

function role(key: string, extra: Partial<VenueRole> = {}): VenueRole {
  return {
    id: `r-${key}`,
    venue_id: "v1",
    key,
    name: "",
    color: "#3b82f6",
    in_schedule: true,
    position: 0,
    is_system: true,
    permissions: [],
    created_at: "2026-11-25T10:00:00Z",
    ...extra,
  };
}

function member(id: string, roleKey: string): StaffMember {
  return { id, venue_id: "v1", email: `${id}@x.md`, role: roleKey, status: "ACTIVE", created_at: "" };
}

const roles = [
  role("waiter", { position: 0 }),
  role("cook", { position: 1, color: "#f59e0b" }),
  role("custom-acc", { position: 2, name: "Бухгалтер", in_schedule: false, is_system: false }),
  role("custom-sushi", { position: 3, name: "Сушист", is_system: false }),
];

describe("venue roles", () => {
  it("lists the discover venue types", () => {
    expect(VENUE_TYPE_IDS).toContain("cafe");
    expect(VENUE_TYPE_IDS).toContain("wine_bar");
    expect(isVenueTypeId("bakery")).toBe(true);
    expect(isVenueTypeId("casino")).toBe(false);
  });

  it("labels roles by own name, preset name, then key", () => {
    expect(roleLabel({ key: "waiter", name: "" }, names)).toBe("Официант");
    expect(roleLabel({ key: "waiter", name: "Официант зала" }, names)).toBe("Официант зала");
    expect(roleLabel({ key: "custom-x" }, names)).toBe("custom-x");
    expect(roleNameByKey("custom-sushi", roles, names)).toBe("Сушист");
    expect(shiftRoleLabel({ role: "barista", role_name: "" }, names)).toBe("Бариста");
  });

  it("keeps only planner roles in order", () => {
    expect(plannerRoles(roles).map((r) => r.key)).toEqual(["waiter", "cook", "custom-sushi"]);
  });

  it("groups the team by role, hides roles out of the planner and keeps orphans", () => {
    const staff = [member("a", "waiter"), member("b", "custom-sushi"), member("c", "custom-acc"), member("d", "gone")];
    const planner = groupStaffByRole(staff, roles, { inScheduleOnly: true });
    expect(planner.map((g) => [g.role.key, g.members.map((m) => m.id)])).toEqual([
      ["waiter", ["a"]],
      ["custom-sushi", ["b"]],
      ["gone", ["d"]],
    ]);
    const all = groupStaffByRole(staff, roles, { includeEmpty: true });
    expect(all.map((g) => g.role.key)).toEqual(["waiter", "cook", "custom-acc", "custom-sushi", "gone"]);
  });

  it("validates role names against other roles", () => {
    expect(validRoleName("  ", roles, names)).toBe("empty");
    expect(validRoleName("x".repeat(41), roles, names)).toBe("too_long");
    expect(validRoleName("официант", roles, names)).toBe("taken");
    expect(validRoleName("Сушист", roles, names, "r-custom-sushi")).toBeNull();
    expect(validRoleName("Кальянщик", roles, names)).toBeNull();
  });

  it("blocks deleting system roles and roles still in use", () => {
    const staff = [member("a", "custom-sushi")];
    expect(deleteState(roles[0], staff)).toEqual({ blocked: "system", members: 0 });
    expect(deleteState(roles[3], staff)).toEqual({ blocked: "in_use", members: 1 });
    expect(deleteState(roles[2], staff)).toEqual({ blocked: null, members: 0 });
  });

  it("picks an unused colour", () => {
    expect(nextRoleColor(roles)).toBe("#22c55e");
  });
});
