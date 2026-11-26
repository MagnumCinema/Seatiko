// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Order, type Table, type WaiterCall, type WaitlistEntry } from "@/lib/api";
import { getSiteCopy } from "@/lib/site-copy";
import { orderBoard } from "@/lib/staff-floor";
import { StaffCallsTab } from "./staff-calls";
import { actionErrorText, agoText, waitText } from "./staff-live";
import { StaffOrdersTab } from "./staff-orders";
import { StaffWaitlistTab } from "./staff-waitlist";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const ru = getSiteCopy("ru").staff;
const NOW = Date.parse("2026-11-26T17:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

function render(element: React.ReactElement) {
  act(() => root.render(element));
}

const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

async function click(element: Element | undefined) {
  if (!element) throw new Error("element not found");
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function type(input: Element | null, value: string) {
  if (!input) throw new Error("input not found");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("staff texts", () => {
  it("never shows raw server codes", () => {
    expect(actionErrorText(new ApiError(409, "already_accepted"), ru)).toBe(ru.errors.alreadyAccepted);
    expect(actionErrorText(new ApiError(409, "table_not_free"), ru)).toBe(ru.errors.tableNotFree);
    expect(actionErrorText(new ApiError(409, "age_check_pending"), ru)).toBe(ru.errors.ageCheckPending);
    expect(actionErrorText(new ApiError(409, "conflict"), ru)).toBe(ru.errors.changed);
    expect(actionErrorText(new ApiError(403, "forbidden"), ru)).toBe(ru.errors.forbidden);
    expect(actionErrorText(new ApiError(400, "bad_request"), ru)).toBe(ru.errors.action);
    expect(actionErrorText(new TypeError("Failed to fetch"), ru)).toBe(ru.errors.network);
  });

  it("says waiting times in words", () => {
    expect(waitText(0, ru)).toBe("только что");
    expect(waitText(4, ru)).toBe("4 мин");
    expect(waitText(65, ru)).toBe("1 ч 5 мин");
    expect(agoText(0, ru)).toBe("только что");
    expect(agoText(3, ru)).toBe("3 мин назад");
    expect(agoText(3, getSiteCopy("ro").staff)).toBe("acum 3 min");
  });
});

describe("StaffCallsTab", () => {
  const calls: WaiterCall[] = [
    { id: "a", table_id: "t3", reason: "bill", status: "PENDING", created_at: ago(8) },
    { id: "b", table_id: "t7", reason: "order", status: "ACCEPTED", created_at: ago(2) },
    { id: "c", table_id: "t1", reason: "question", status: "DONE", created_at: ago(30) },
  ];

  it("shows table numbers and reasons, answers and finishes calls", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const onAccept = vi.fn(async () => {});
    const onDone = vi.fn(async () => {});
    render(
      createElement(StaffCallsTab, {
        copy: ru,
        locale: "ru",
        calls,
        tableNumbers: new Map([
          ["t3", 3],
          ["t7", 7],
          ["t1", 1],
        ]),
        fresh: new Set(["a"]),
        now: NOW,
        onAccept,
        onDone,
      }),
    );
    expect(text()).toContain("Стол 3");
    expect(text()).toContain("Просит счёт");
    expect(text()).toContain("ждёт 8 мин");
    expect(text()).toContain(ru.calls.newBadge);
    expect(container.querySelector(".sf-call.tone-danger")).not.toBeNull();
    // Today's done call is folded away.
    expect(text()).not.toContain("Есть вопрос");
    await click(button(ru.calls.accept));
    expect(onAccept).toHaveBeenCalledWith(calls[0]);
    await click(container.querySelectorAll(".sf-call")[1].querySelector("button") ?? undefined);
    expect(onDone).toHaveBeenCalledWith(calls[1]);
    await click(container.querySelector(".sf-toggle") ?? undefined);
    expect(text()).toContain("Есть вопрос");
    vi.useRealTimers();
  });

  it("has a calm empty state", () => {
    render(
      createElement(StaffCallsTab, {
        copy: ru,
        locale: "ru",
        calls: [],
        tableNumbers: new Map<string, number>(),
        fresh: new Set<string>(),
        now: NOW,
        onAccept: async () => {},
        onDone: async () => {},
      }),
    );
    expect(text()).toContain(ru.calls.emptyTitle);
  });
});

describe("StaffOrdersTab", () => {
  const order = (over: Partial<Order>): Order => ({
    id: "o",
    session_id: "s",
    user_id: "u",
    venue_id: "v",
    items: [{ menu_item_id: "m", name: { ru: "Вино", en: "Wine", ro: "Vin" }, qty: 2, price: 90 }],
    status: "SUBMITTED",
    total: 180,
    created_at: ago(4),
    updated_at: ago(4),
    ...over,
  });

  type Handlers = {
    onAdvance?: (order: Order, status: "PREPARING" | "READY" | "SERVED" | "PAID") => Promise<void>;
    onCancel?: (order: Order) => Promise<void>;
    onAgeCheck?: (order: Order, approved: boolean) => Promise<void>;
  };

  function mount(orders: Order[], handlers: Handlers = {}) {
    render(
      createElement(StaffOrdersTab, {
        copy: ru,
        locale: "ru",
        board: orderBoard(orders, NOW),
        tablesOf: () => [5],
        now: NOW,
        onAdvance: handlers.onAdvance ?? vi.fn(async () => {}),
        onCancel: handlers.onCancel ?? vi.fn(async () => {}),
        onAgeCheck: handlers.onAgeCheck ?? vi.fn(async () => {}),
      }),
    );
  }

  it("moves an order one step on", async () => {
    const onAdvance = vi.fn(async () => {});
    mount([order({ id: "n", check_number: "CHK-1" })], { onAdvance });
    expect(text()).toContain("Стол 5");
    expect(text()).toContain("CHK-1");
    expect(text()).toContain("2×");
    expect(text()).toMatch(/180\s+MDL/);
    await click(button(ru.orders.next.PREPARING));
    expect(onAdvance).toHaveBeenCalledWith(expect.objectContaining({ id: "n" }), "PREPARING");
  });

  it("blocks serving 18+ lines until the ID is checked", async () => {
    const onAgeCheck = vi.fn(async () => {});
    mount(
      [
        order({
          id: "r",
          status: "READY",
          preorder: true,
          items: [{ menu_item_id: "w", name: { ru: "Вино", en: "Wine", ro: "Vin" }, qty: 1, price: 90, requires_age_18: true, age_check: "PENDING_AGE_CHECK" }],
        }),
      ],
      { onAgeCheck },
    );
    expect(text()).toContain(ru.orders.ageTitle);
    expect(button(ru.orders.next.SERVED)?.disabled).toBe(true);
    await click(button(ru.orders.ageApprove));
    expect(onAgeCheck).toHaveBeenCalledWith(expect.objectContaining({ id: "r" }), true);
  });

  it("asks before cancelling", async () => {
    const onCancel = vi.fn(async () => {});
    mount([order({ id: "x" })], { onCancel });
    await click(button(ru.orders.cancel));
    expect(onCancel).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(ru.orders.cancelBody);
    const confirm = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === ru.orders.cancelConfirm);
    await click(confirm);
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("keeps old closed orders off the board", () => {
    mount([order({ id: "p", status: "PAID", paid_at: "2026-11-20T10:00:00Z", updated_at: "2026-11-20T10:00:00Z" })]);
    expect(text()).toContain(ru.orders.emptyTitle);
  });
});

describe("StaffWaitlistTab", () => {
  const tables: Table[] = [
    { id: "t2", venue_id: "v", number: 2, seats: 4, status: "FREE", x: 0, y: 0 },
    { id: "t3", venue_id: "v", number: 3, seats: 2, status: "OCCUPIED", x: 0, y: 0 },
  ];
  const entry: WaitlistEntry = { id: "w1", venue_id: "v", guest_name: "Ион", guests: 3, status: "WAITING", source: "HOST", created_at: ago(20) };

  function mount(onAdd = vi.fn(async () => true)) {
    render(
      createElement(StaffWaitlistTab, {
        copy: ru,
        locale: "ru",
        seatsForms: getSiteCopy("ru").cabinet.bookings.seatsForms,
        entries: [entry],
        tables,
        now: NOW,
        onAdd,
        onNotify: vi.fn(async () => {}),
        onSeat: vi.fn(async () => {}),
        onClose: vi.fn(async () => {}),
      }),
    );
    return onAdd;
  }

  it("adds a walk-in only with a name and a valid phone", async () => {
    const onAdd = mount();
    const add = () => button(ru.waitlist.add)!;
    expect(add().disabled).toBe(true);
    type(container.querySelector('input[placeholder="Например, Ион"]'), "Мария");
    type(container.querySelector('input[type="tel"]'), "12");
    expect(add().disabled).toBe(true);
    type(container.querySelector('input[type="tel"]'), "+373 68 123 456");
    expect(add().disabled).toBe(false);
    await click(container.querySelector(`button[aria-label="${ru.waitlist.more}"]`) ?? undefined);
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onAdd).toHaveBeenCalledWith({ guest_name: "Мария", guests: 3, phone: "+373 68 123 456", note: undefined });
  });

  it("shows the queue with waiting time, and calls only after a table is picked", () => {
    mount();
    expect(text()).toContain("Ион");
    expect(text()).toContain("3 гостя");
    expect(text()).toContain("ждёт 20 мин");
    expect(text()).toContain("Свободно столов: 1 из 2");
    expect(container.querySelector(".sf-q.tone-warn")).not.toBeNull();
    expect(button(ru.waitlist.call)?.disabled).toBe(true);
    expect(button(ru.waitlist.seat)?.disabled).toBe(true);
  });
});
