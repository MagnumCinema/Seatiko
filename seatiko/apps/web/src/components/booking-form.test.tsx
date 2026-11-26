// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Table, type Venue, type VenueScheduleSlot } from "@/lib/api";
import ru from "../../messages/ru.json";

const api = vi.hoisted(() => ({
  fetchVenueSchedule: vi.fn(),
  createReservation: vi.fn(),
  fetchReservations: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), ...api }));
vi.mock("next/link", () => ({ default: (props: { href: string; children: unknown }) => createElement("a", { href: props.href }, props.children as never) }));

import { LocaleProvider } from "./locale-provider";
import { BookingForm } from "./booking-form";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const venue = {
  id: "venue-12",
  name: { ru: "Porto Mare", en: "Porto Mare", ro: "Porto Mare" },
  hours_text: "Пн–Вс 00:00–23:59",
} as unknown as Venue;

const table: Table = { id: "t-v12-2", venue_id: "venue-12", number: 2, seats: 4, status: "FREE", x: 0, y: 0 };

/** The table is taken for the whole booking window: no bookable time on any day. */
const allDay = (): VenueScheduleSlot[] => [
  {
    id: "r1",
    table_id: table.id,
    table_number: 2,
    starts_at: new Date(Date.now() - 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
    kind: "RESERVATION",
  } as VenueScheduleSlot,
];

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(createElement(LocaleProvider, null, createElement(BookingForm, { venue, table, variant: "popup" })));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function confirmButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>("button.venue-cta-primary");
  if (!button) throw new Error("no confirm button");
  return button;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.setItem("fa_token", "token");
  api.fetchVenueSchedule.mockReset();
  api.createReservation.mockReset();
  api.fetchReservations.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

describe("BookingForm confirm button", () => {
  it("is never silently dead: with no bookable time a press says why and sends nothing", async () => {
    api.fetchVenueSchedule.mockResolvedValue(allDay());
    await render();
    const button = confirmButton();
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(api.createReservation).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(ru["res.no_slots"]);
  });

  it("sends the booking for the picked table and time", async () => {
    api.fetchVenueSchedule.mockResolvedValue([]);
    api.createReservation.mockResolvedValue({ id: "new-booking" });
    await render();
    await act(async () => confirmButton().click());
    expect(api.createReservation).toHaveBeenCalledTimes(1);
    expect(api.createReservation.mock.calls[0][0]).toMatchObject({ venue_id: "venue-12", table_id: table.id, guests: 2 });
  });

  it("shows a network error instead of hanging when the request times out", async () => {
    api.fetchVenueSchedule.mockResolvedValue([]);
    api.createReservation.mockRejectedValue(new DOMException("signal timed out", "TimeoutError"));
    await render();
    await act(async () => confirmButton().click());
    expect(confirmButton().disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(ru["error.network"]);
  });

  it("brings the sign-in form into view when the session is missing or expired", async () => {
    const scrolled: Element[] = [];
    const scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true });
    localStorage.removeItem("fa_token");
    api.fetchVenueSchedule.mockResolvedValue([]);
    await render();
    await act(async () => confirmButton().click());
    const auth = container.querySelector(".booking-popup-auth");
    expect(auth).not.toBeNull();
    expect(scrolled.some((el) => el.contains(auth))).toBe(true);
    expect(auth?.contains(document.activeElement)).toBe(true);
    expect(api.createReservation).not.toHaveBeenCalled();
  });

  it("brings the error into view when the booking is refused", async () => {
    const scrolled: Element[] = [];
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: function (this: Element) {
        scrolled.push(this);
      },
      configurable: true,
    });
    api.fetchVenueSchedule.mockResolvedValue([]);
    api.createReservation.mockRejectedValue(new ApiError(409, "active_reservation_exists"));
    await render();
    await act(async () => confirmButton().click());
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(ru["error.active_reservation"]);
    expect(scrolled).toContain(alert);
  });
});

