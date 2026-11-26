import { describe, expect, it } from "vitest";
import type { ApplicationActivity, ProfileChangeRequest } from "@/lib/api";
import {
  actionMeta,
  actorOf,
  clip,
  countBy,
  DEFAULT_HISTORY_FILTERS,
  filterEntries,
  filtersActive,
  groupEntriesByDay,
  KNOWN_ACTIONS,
  linkChangeRequests,
  normalizeFields,
  patchRows,
  periodFirstDay,
  sortEntries,
  toCsv,
  toHistoryEntry,
  type HistoryEntry,
} from "@/lib/cabinet-history";

const OWNER = "user-owner";

function raw(partial: Partial<ApplicationActivity> & { id: string; action: string; created_at: string }): ApplicationActivity {
  return {
    application_id: "app-1",
    actor_user_id: OWNER,
    actor_role: "restaurant",
    changed_fields: [],
    ...partial,
  };
}

function entry(partial: Partial<ApplicationActivity> & { id: string; action: string; created_at: string }): HistoryEntry {
  const value = toHistoryEntry(raw(partial), OWNER);
  if (!value) throw new Error("bad entry");
  return value;
}

function request(partial: Partial<ProfileChangeRequest> & { id: string; created_at: string }): ProfileChangeRequest {
  return { application_id: "app-1", owner_user_id: OWNER, status: "PENDING", patch: {}, ...partial };
}

describe("actions", () => {
  it("knows every action the API writes and gives each a category and a link", () => {
    for (const action of KNOWN_ACTIONS) {
      const meta = actionMeta(action);
      expect(meta.category).not.toBe("other");
      expect(meta.target).not.toBeNull();
    }
  });

  it("puts unknown actions under «other» without a link", () => {
    expect(actionMeta("MENU_IMPORTED")).toEqual({ category: "other", tone: "muted", target: null });
    expect(entry({ id: "x", action: "MENU_IMPORTED", created_at: "2026-11-26T10:00:00Z" }).known).toBe(false);
  });
});

describe("actorOf", () => {
  it("tells the owner, Seatiko moderators, the CRM sync and other venue users apart", () => {
    expect(actorOf({ actor_role: "restaurant", actor_user_id: OWNER }, OWNER)).toBe("owner");
    expect(actorOf({ actor_role: "admin", actor_user_id: "user-admin" }, OWNER)).toBe("seatiko");
    expect(actorOf({ actor_role: "system", actor_user_id: "twenty-crm" }, OWNER)).toBe("system");
    expect(actorOf({ actor_role: "restaurant", actor_user_id: "" }, OWNER)).toBe("system");
    expect(actorOf({ actor_role: "restaurant", actor_user_id: "user-manager" }, OWNER)).toBe("staff");
  });
});

describe("toHistoryEntry", () => {
  it("accepts the null the API sends for an empty field list", () => {
    const value = entry({ id: "a", action: "APPLICATION_SUBMITTED", created_at: "2026-11-26T10:00:00Z", changed_fields: null });
    expect(value.fields).toEqual([]);
  });

  it("drops the redundant «photos» field of photo actions", () => {
    expect(entry({ id: "a", action: "PHOTO_ADDED", created_at: "2026-11-26T10:00:00Z", changed_fields: ["photos"] }).fields).toEqual([]);
  });

  it("skips rows with a broken date", () => {
    expect(toHistoryEntry(raw({ id: "a", action: "PHOTO_ADDED", created_at: "nope" }), OWNER)).toBeNull();
  });

  it("trims the note", () => {
    expect(entry({ id: "a", action: "APPLICATION_REJECTED", created_at: "2026-11-26T10:00:00Z", note: "  Нужно фото  " }).note).toBe("Нужно фото");
  });
});

describe("normalizeFields", () => {
  it("merges journal and patch names, joins the map point and keeps display order", () => {
    expect(normalizeFields(["phone", "latitude", "longitude", "name", "hours_text", "city"])).toEqual([
      "name",
      "city",
      "location",
      "phone",
      "hours",
    ]);
  });

  it("keeps unknown keys at the end once", () => {
    expect(normalizeFields(["menu", "phone", "menu"])).toEqual(["phone", "menu"]);
    expect(normalizeFields(null)).toEqual([]);
  });
});

describe("sortEntries", () => {
  it("puts the newest first and keeps ties stable", () => {
    const list = [
      { id: "a", at: 1 },
      { id: "c", at: 2 },
      { id: "b", at: 2 },
    ];
    expect(sortEntries(list).map((e) => e.id)).toEqual(["c", "b", "a"]);
    expect(sortEntries([...list].reverse()).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });
});

describe("linkChangeRequests", () => {
  it("pairs a request entry with the request written in the same transaction", () => {
    const e = entry({ id: "e1", action: "PROFILE_CHANGE_REQUESTED", created_at: "2026-11-24T23:30:00.120Z" });
    const r = request({ id: "r1", created_at: "2026-11-24T23:30:00.100Z" });
    const far = request({ id: "r0", created_at: "2026-11-20T10:00:00Z" });
    expect(linkChangeRequests([e], [far, r]).get("e1")?.id).toBe("r1");
  });

  it("does not pair requests of another venue", () => {
    const e = entry({ id: "e1", action: "PROFILE_CHANGE_REQUESTED", created_at: "2026-11-24T23:30:00Z" });
    const r = request({ id: "r1", application_id: "app-2", created_at: "2026-11-24T23:30:00Z" });
    expect(linkChangeRequests([e], [r]).size).toBe(0);
  });

  it("pairs a review with the only request that has its outcome", () => {
    const asked = entry({ id: "e1", action: "PROFILE_CHANGE_REQUESTED", created_at: "2026-11-24T10:00:00Z" });
    const approved = entry({ id: "e2", action: "PROFILE_CHANGE_APPROVED", created_at: "2026-11-25T10:00:00Z", actor_role: "admin" });
    const rejected = entry({
      id: "e3",
      action: "PROFILE_CHANGE_REJECTED",
      created_at: "2026-11-26T10:00:00Z",
      actor_role: "admin",
      note: "Адрес не совпадает",
    });
    const r1 = request({ id: "r1", status: "APPROVED", created_at: "2026-11-24T10:00:00Z" });
    const r2 = request({ id: "r2", status: "REJECTED", note: "Адрес не совпадает", created_at: "2026-11-25T15:00:00Z" });
    const links = linkChangeRequests([rejected, approved, asked], [r1, r2]);
    expect(links.get("e1")?.id).toBe("r1");
    expect(links.get("e2")?.id).toBe("r1");
    expect(links.get("e3")?.id).toBe("r2");
  });

  it("leaves a review unpaired when two requests fit", () => {
    const approved = entry({ id: "e2", action: "PROFILE_CHANGE_APPROVED", created_at: "2026-11-25T10:00:00Z", actor_role: "admin" });
    const r1 = request({ id: "r1", status: "APPROVED", created_at: "2026-11-24T10:00:00Z" });
    const r2 = request({ id: "r2", status: "APPROVED", created_at: "2026-11-24T11:00:00Z" });
    expect(linkChangeRequests([approved], [r1, r2]).has("e2")).toBe(false);
  });

  it("does not pair a review with a request made after it", () => {
    const approved = entry({ id: "e2", action: "PROFILE_CHANGE_APPROVED", created_at: "2026-11-25T10:00:00Z", actor_role: "admin" });
    const later = request({ id: "r1", status: "APPROVED", created_at: "2026-11-26T10:00:00Z" });
    expect(linkChangeRequests([approved], [later]).size).toBe(0);
  });

  it("checks the rejection note", () => {
    const rejected = entry({ id: "e3", action: "PROFILE_CHANGE_REJECTED", created_at: "2026-11-26T10:00:00Z", note: "Другое" });
    const r = request({ id: "r2", status: "REJECTED", note: "Адрес не совпадает", created_at: "2026-11-25T15:00:00Z" });
    expect(linkChangeRequests([rejected], [r]).size).toBe(0);
  });
});

describe("patchRows", () => {
  it("lists requested values in display order with one map point row", () => {
    expect(
      patchRows({ phone: "+37322777888", lng: 28.83, hours_text: "09–23", lat: 47.03, name: { ru: "Олива", ro: "Oliva", en: "Oliva" } }),
    ).toEqual([
      { field: "name", value: { ru: "Олива", ro: "Oliva", en: "Oliva" } },
      { field: "location", value: { lat: 47.03, lng: 28.83 } },
      { field: "phone", value: "+37322777888" },
      { field: "hours", value: "09–23" },
    ]);
    expect(patchRows(null)).toEqual([]);
  });
});

describe("clip", () => {
  it("cuts long texts on one line", () => {
    expect(clip("a\n b", 10)).toBe("a b");
    expect(clip("abcdefghijkl", 6)).toBe("abcde…");
  });
});

describe("filters", () => {
  // 26 Nov 2026, 12:00 in Chișinău (UTC+2).
  const now = Date.parse("2026-11-26T10:00:00Z");
  const list = [
    entry({ id: "today", action: "PHOTO_REMOVED", created_at: "2026-11-26T09:40:00Z" }),
    // 01:30 on 25 Nov in Chișinău, still 24 Nov in UTC.
    entry({ id: "late", action: "PROFILE_CHANGE_REQUESTED", created_at: "2026-11-24T23:30:00Z" }),
    entry({ id: "admin", action: "APPLICATION_APPROVED", created_at: "2026-11-20T09:00:00Z", actor_role: "admin" }),
    entry({ id: "old", action: "PROFILE_UPDATED", created_at: "2026-09-01T09:00:00Z", changed_fields: ["phone"] }),
  ];
  const text = (e: HistoryEntry) => `${e.action} ${e.fields.join(" ")}`;

  it("counts periods in venue days", () => {
    expect(periodFirstDay("all", now)).toBeNull();
    expect(periodFirstDay("today", now)).toBe("2026-11-26");
    expect(periodFirstDay("7d", now)).toBe("2026-11-20");
    expect(periodFirstDay("30d", now)).toBe("2026-10-28");
  });

  it("filters by period, category, who and words", () => {
    const ids = (f: Partial<typeof DEFAULT_HISTORY_FILTERS>) =>
      filterEntries(list, { ...DEFAULT_HISTORY_FILTERS, ...f }, now, text).map((e) => e.id);
    expect(ids({})).toEqual(["today", "late", "admin", "old"]);
    expect(ids({ period: "today" })).toEqual(["today"]);
    expect(ids({ period: "7d" })).toEqual(["today", "late", "admin"]);
    expect(ids({ category: "moderation" })).toEqual(["admin"]);
    expect(ids({ who: "seatiko" })).toEqual(["admin"]);
    expect(ids({ who: "owner", category: "photos" })).toEqual(["today"]);
    expect(ids({ query: "  PHONE  " })).toEqual(["old"]);
    expect(ids({ query: "profile phone" })).toEqual(["old"]);
    expect(ids({ query: "profile nothing" })).toEqual([]);
  });

  it("knows when any filter is on", () => {
    expect(filtersActive(DEFAULT_HISTORY_FILTERS)).toBe(false);
    expect(filtersActive({ ...DEFAULT_HISTORY_FILTERS, query: "  " })).toBe(false);
    expect(filtersActive({ ...DEFAULT_HISTORY_FILTERS, who: "owner" })).toBe(true);
  });

  it("groups by the venue calendar day", () => {
    const groups = groupEntriesByDay(sortEntries(list));
    expect(groups.map((g) => [g.day, g.entries.map((e) => e.id)])).toEqual([
      ["2026-11-26", ["today"]],
      ["2026-11-25", ["late"]],
      ["2026-11-20", ["admin"]],
      ["2026-09-01", ["old"]],
    ]);
  });

  it("counts by a key", () => {
    expect(countBy(list, (e) => e.category)).toEqual({ photos: 1, changes: 1, moderation: 1, profile: 1 });
  });
});

describe("toCsv", () => {
  it("quotes, escapes, defuses formulas and starts with a BOM", () => {
    const csv = toCsv([
      ["Дата", "Комментарий"],
      ["2026-11-26 12:00", 'Сказал "да", потом\nнет'],
      ["=SUM(A1)", "+373"],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Сказал ""да"", потом\nнет"');
    expect(csv).toContain("'=SUM(A1),'+373");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
