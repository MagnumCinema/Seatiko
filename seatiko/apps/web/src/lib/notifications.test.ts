import { describe, expect, it } from "vitest";
import { createSseParser, type AppNotification } from "./api";
import { mergeNotification, notificationHref, notificationTextKey } from "./notifications";

describe("createSseParser", () => {
  it("parses events split across chunks and skips pings", () => {
    const events: [string, string][] = [];
    const feed = createSseParser((event, data) => events.push([event, data]));
    feed('event: ready\ndata: {"unread":2}\n\n: ping\n\nid: 1\nevent: notifi');
    feed('cation\ndata: {"id":"1"}\n\n');
    expect(events).toEqual([
      ["ready", '{"unread":2}'],
      ["notification", '{"id":"1"}'],
    ]);
  });

  it("handles CRLF and multi-line data", () => {
    const events: string[] = [];
    const feed = createSseParser((_, data) => events.push(data));
    feed("data: a\r\ndata: b\r\n\r\n");
    expect(events).toEqual(["a\nb"]);
  });
});

describe("notifications", () => {
  const n = (id: string, kind = "PREORDER_CREATED") => ({ id, kind, user_id: "u", created_at: "" }) as AppNotification;

  it("maps kinds to texts with a fallback", () => {
    expect(notificationTextKey({ kind: "PREORDER_PREPARING" })).toBe("notify.preorder_preparing");
    expect(notificationTextKey({ kind: "SOMETHING_NEW" })).toBe("notify.generic");
  });

  it("links staff to the panel and guests to the account", () => {
    expect(notificationHref({ kind: "PREORDER_CREATED" }, "staff")).toBe("/staff");
    expect(notificationHref({ kind: "PREORDER_CREATED" }, "restaurant")).toBe("/cabinet");
    expect(notificationHref({ kind: "ADULT_GRANTED" }, "guest")).toBe("/account");
  });

  it("puts live notifications on top without duplicates", () => {
    const list = [n("2"), n("1")];
    expect(mergeNotification(list, n("3")).map((x) => x.id)).toEqual(["3", "2", "1"]);
    expect(mergeNotification(list, n("1")).map((x) => x.id)).toEqual(["1", "2"]);
    expect(mergeNotification(list, n("3"), 2).map((x) => x.id)).toEqual(["3", "2"]);
  });
});
