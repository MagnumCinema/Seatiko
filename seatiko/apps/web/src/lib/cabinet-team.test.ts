import { describe, expect, it } from "vitest";
import type { StaffMember, VenueRole, WorkShift } from "./api";
import {
  defaultInviteRole,
  fillTemplate,
  filterTeam,
  findMemberByEmail,
  inviteProblem,
  isValidEmail,
  memberInitials,
  memberName,
  memberStatus,
  relinkInvite,
  removeMember,
  shiftsToday,
  sortTeam,
  teamCounts,
  upcomingShiftsOf,
  type TeamApi,
} from "./cabinet-team";

function member(id: string, extra: Partial<StaffMember> = {}): StaffMember {
  return {
    id,
    venue_id: "venue-1",
    email: `${id}@seatiko.local`,
    role: "waiter",
    status: "ACTIVE",
    on_shift: false,
    created_at: "2026-11-20T10:00:00Z",
    ...extra,
  };
}

function role(key: string, extra: Partial<VenueRole> = {}): VenueRole {
  return {
    id: `role-${key}`,
    venue_id: "venue-1",
    key,
    name: "",
    color: "#3b82f6",
    in_schedule: true,
    position: 0,
    is_system: true,
    permissions: [],
    created_at: "2026-11-01T00:00:00Z",
    ...extra,
  };
}

function shift(id: string, staffId: string, date: string, start: string, end: string, extra: Partial<WorkShift> = {}): WorkShift {
  return {
    id,
    venue_id: "venue-1",
    staff_id: staffId,
    staff_name: staffId,
    role: "waiter",
    date,
    start_time: start,
    end_time: end,
    status: "CONFIRMED",
    created_at: "2026-11-20T10:00:00Z",
    updated_at: "2026-11-20T10:00:00Z",
    ...extra,
  };
}

describe("memberName / memberInitials", () => {
  it("uses the name, else the part of the email before @", () => {
    expect(memberName(member("a", { name: "  Marco Bellini " }))).toBe("Marco Bellini");
    expect(memberName(member("victor.panaite"))).toBe("victor.panaite");
  });

  it("takes the first letters of the first and the last word", () => {
    expect(memberInitials(member("a", { name: "Marco Bellini" }))).toBe("MB");
    expect(memberInitials(member("a", { name: "Андрей Попа" }))).toBe("АП");
    expect(memberInitials(member("a", { name: "Ana Maria Popescu" }))).toBe("AP");
  });

  it("uses two letters of a single word and splits email names on dots", () => {
    expect(memberInitials(member("a", { name: "Анна" }))).toBe("АН");
    expect(memberInitials(member("alex.rusu"))).toBe("AR");
    expect(memberInitials(member("x", { name: "", email: "@" }))).toBe("?");
  });
});

describe("isValidEmail / inviteProblem", () => {
  it("accepts ordinary addresses and rejects broken ones", () => {
    expect(isValidEmail("ion.popescu@gmail.com")).toBe(true);
    expect(isValidEmail(" Ion@Mail.md ")).toBe(true);
    expect(isValidEmail("ion@")).toBe(false);
    expect(isValidEmail("ion@mail")).toBe(false);
    expect(isValidEmail("ion mail@x.md")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("finds a teammate with the same email, ignoring case and spaces", () => {
    const staff = [member("a", { email: "Ion@Mail.md" })];
    expect(findMemberByEmail(staff, " ion@mail.md ")?.id).toBe("a");
    expect(findMemberByEmail(staff, "ana@mail.md")).toBeUndefined();
  });

  it("names the problem of an invite before it is sent", () => {
    const staff = [member("a", { email: "ion@mail.md" })];
    expect(inviteProblem("", staff)).toBe("empty");
    expect(inviteProblem("ion@", staff)).toBe("invalid");
    expect(inviteProblem("ION@mail.md", staff)).toBe("duplicate");
    expect(inviteProblem("ana@mail.md", staff)).toBeNull();
  });
});

describe("memberStatus / teamCounts", () => {
  it("tells invited, on shift and active people apart", () => {
    expect(memberStatus(member("a", { status: "INVITED", on_shift: true }))).toBe("invited");
    expect(memberStatus(member("a", { on_shift: true }))).toBe("on_shift");
    expect(memberStatus(member("a"))).toBe("active");
    expect(memberStatus(member("a", { status: "REVOKED" }))).toBe("revoked");
  });

  it("counts the team by status", () => {
    const staff = [
      member("a", { on_shift: true }),
      member("b"),
      member("c", { status: "INVITED" }),
      member("d", { on_shift: true }),
    ];
    expect(teamCounts(staff)).toEqual({ all: 4, onShift: 2, invited: 1 });
  });
});

describe("filterTeam", () => {
  const staff = [
    member("a", { name: "Ioana Ciobanu", email: "ionela@seatiko.md", role: "waiter", on_shift: true }),
    member("b", { name: "Андрей Попа", email: "andrei@seatiko.md", role: "cook" }),
    member("c", { name: "Ștefan Rusu", email: "stefan@seatiko.md", role: "waiter", status: "INVITED" }),
  ];

  it("matches every word in the name or email, without case or diacritics", () => {
    expect(filterTeam(staff, { query: "stefan", role: "all", status: "all" }).map((m) => m.id)).toEqual(["c"]);
    expect(filterTeam(staff, { query: "андрей попа", role: "all", status: "all" }).map((m) => m.id)).toEqual(["b"]);
    expect(filterTeam(staff, { query: "SEATIKO.md", role: "all", status: "all" })).toHaveLength(3);
    expect(filterTeam(staff, { query: "ioana rusu", role: "all", status: "all" })).toHaveLength(0);
  });

  it("filters by role and status together", () => {
    expect(filterTeam(staff, { query: "", role: "waiter", status: "all" }).map((m) => m.id)).toEqual(["a", "c"]);
    expect(filterTeam(staff, { query: "", role: "waiter", status: "invited" }).map((m) => m.id)).toEqual(["c"]);
    expect(filterTeam(staff, { query: "", role: "all", status: "on_shift" }).map((m) => m.id)).toEqual(["a"]);
  });
});

describe("defaultInviteRole", () => {
  it("prefers the waiter role, then the first role in the schedule, then any role", () => {
    expect(defaultInviteRole([role("pizzaiolo"), role("waiter", { position: 5 })])).toBe("waiter");
    expect(
      defaultInviteRole([role("manager", { in_schedule: false, position: 0 }), role("cook", { position: 1 })]),
    ).toBe("cook");
    expect(defaultInviteRole([role("manager", { in_schedule: false })])).toBe("manager");
    expect(defaultInviteRole([])).toBe("");
  });
});

describe("sortTeam", () => {
  it("orders by the venue's role order, then by name, unknown roles last (like the API)", () => {
    const roles = [role("cook", { position: 1 }), role("waiter", { position: 0 })];
    const staff = [
      member("1", { name: "Zoe", role: "cook" }),
      member("2", { name: "Ana", role: "hookah" }),
      member("3", { name: "Boris", role: "waiter" }),
      member("4", { name: "Alex", role: "waiter" }),
      member("5", { name: "Ana", role: "cook" }),
    ];
    expect(sortTeam(staff, roles).map((m) => m.id)).toEqual(["4", "3", "5", "1", "2"]);
  });
});

describe("fillTemplate", () => {
  it("puts values into {placeholders} and leaves unknown ones empty", () => {
    expect(fillTemplate("{name}: {count} смен", { name: "Ion", count: 3 })).toBe("Ion: 3 смен");
    expect(fillTemplate("{missing}!", {})).toBe("!");
  });
});

describe("shiftsToday / upcomingShiftsOf", () => {
  const shifts = [
    shift("s1", "a", "2026-11-26", "18:00", "23:00"),
    shift("s2", "a", "2026-11-26", "10:00", "14:00"),
    shift("s3", "a", "2026-11-26", "09:00", "10:00", { status: "DECLINED" }),
    shift("s4", "b", "2026-11-26", "10:00", "22:00"),
    shift("s5", "a", "2026-11-27", "10:00", "22:00"),
    shift("s6", "a", "2026-11-25", "10:00", "22:00"),
  ];

  it("lists the member's shifts of the day in time order, without declined ones", () => {
    expect(shiftsToday(shifts, "a", "2026-11-26").map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(shiftsToday(shifts, "c", "2026-11-26")).toEqual([]);
  });

  it("counts shifts still ahead: later days and today's shifts that have not started", () => {
    // 12:00 venue time: s2 (10:00) and s3 (09:00) already started, s1 and s5 are ahead.
    expect(upcomingShiftsOf(shifts, "a", "2026-11-26", 12 * 60).map((s) => s.id)).toEqual(["s1", "s5"]);
  });
});

/** A fake API that records calls, for the invite re-check and removal flows. */
function fakeApi(created: StaffMember, opts: { failSwap?: string[]; failDelete?: string[]; failRemove?: string[] } = {}) {
  const calls: string[] = [];
  const api: TeamApi = {
    invite: async (email, name, roleKey) => {
      calls.push(`invite ${email} ${name} ${roleKey}`);
      return created;
    },
    remove: async (id) => {
      calls.push(`remove ${id}`);
      if (opts.failRemove?.includes(id)) throw new Error("remove failed");
    },
    swapShift: async (shiftId, staffId) => {
      calls.push(`swap ${shiftId} ${staffId}`);
      if (opts.failSwap?.includes(shiftId)) throw new Error("overlap");
    },
    deleteShift: async (shiftId) => {
      calls.push(`delete ${shiftId}`);
      if (opts.failDelete?.includes(shiftId)) throw new Error("gone");
    },
  };
  return { api, calls };
}

describe("relinkInvite", () => {
  const invited = member("old", { name: "Ion", email: "ion@mail.md", role: "cook", status: "INVITED" });
  const ahead = [shift("s1", "old", "2026-11-27", "10:00", "18:00"), shift("s2", "old", "2026-11-28", "10:00", "18:00")];

  it("links an invite whose email now has an account and moves its shifts", async () => {
    const { api, calls } = fakeApi(member("new", { email: "ion@mail.md", role: "cook", status: "ACTIVE" }), { failSwap: ["s2"] });
    const result = await relinkInvite(api, invited, ahead);
    expect(result).toEqual({ kind: "linked", member: expect.objectContaining({ id: "new" }), moved: 1, failed: 1 });
    expect(calls).toEqual(["invite ion@mail.md Ion cook", "swap s1 new", "swap s2 new", "remove old"]);
  });

  it("drops the duplicate when there is still no account", async () => {
    const { api, calls } = fakeApi(member("dup", { email: "ion@mail.md", status: "INVITED" }));
    const result = await relinkInvite(api, invited, ahead);
    expect(result).toEqual({ kind: "still_invited" });
    expect(calls).toEqual(["invite ion@mail.md Ion cook", "remove dup"]);
  });
});

describe("removeMember", () => {
  it("removes the member first, then the chosen shifts, and counts failures", async () => {
    const { api, calls } = fakeApi(member("x"), { failDelete: ["s2"] });
    const result = await removeMember(api, member("a"), ["s1", "s2"]);
    expect(result).toEqual({ deletedShifts: 1, failedShifts: 1 });
    expect(calls).toEqual(["remove a", "delete s1", "delete s2"]);
  });

  it("keeps the shifts when the member could not be removed", async () => {
    const { api, calls } = fakeApi(member("x"), { failRemove: ["a"] });
    await expect(removeMember(api, member("a"), ["s1"])).rejects.toThrow("remove failed");
    expect(calls).toEqual(["remove a"]);
  });
});
