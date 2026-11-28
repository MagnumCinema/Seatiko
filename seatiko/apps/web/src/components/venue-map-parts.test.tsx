// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapPlace } from "@/lib/api";
import { sheetHeights } from "@/lib/home-map";

vi.mock("next/link", () => ({
  default: (props: { href: string; className?: string; children: unknown }) =>
    createElement("a", { href: props.href, className: props.className }, props.children as never),
}));

import { MapSheet, PopupCard, openStatus, placeActions, placeMeta } from "./venue-map-parts";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const base = {
  name: { ru: "Олива", en: "Oliva", ro: "Oliva" },
  address: { ru: "ул. Независимости 15A", en: "Independence St 15A", ro: "Str. Independenței 15A" },
  lat: 47.76,
  lng: 27.93,
};
const partner = {
  ...base,
  id: "venue-6",
  venue_id: "venue-6",
  in_database: true,
  bookable: true,
  free_tables: 10,
  open_now: true,
  rating: 4.7,
  cuisine: ["italian"],
  price_level: 2,
  hours_text: "Пн–Вс 10:00–23:00",
} as MapPlace;
const notBookable = { ...partner, id: "venue-9", venue_id: "venue-9", bookable: false } as MapPlace;
const openData = { ...base, id: "osm-1", in_database: false, bookable: false, phone: "+373 231 2 34 56" } as MapPlace;
const openDataNoPhone = { ...openData, id: "osm-2", phone: undefined } as MapPlace;

describe("placeActions", () => {
  it("bookable partner: book + details", () => {
    const { primary, secondary } = placeActions(partner, "ru");
    expect(primary.label).toBe("Забронировать");
    expect(primary.href).toContain("venue-6");
    expect(secondary?.href).toBe("/venues/venue-6");
    expect(secondary?.label).toBe("Подробнее");
  });
  it("partner without booking: details first, then directions", () => {
    const { primary, secondary } = placeActions(notBookable, "en");
    expect(primary).toEqual({ href: "/venues/venue-9", label: "Details" });
    expect(secondary?.external).toBe(true);
  });
  it("open data: directions + call, or Google Maps without a phone", () => {
    expect(placeActions(openData, "ro").secondary).toEqual({ href: "tel:+37323123456", label: "Sună" });
    const noPhone = placeActions(openDataNoPhone, "ro");
    expect(noPhone.primary.label).toBe("Traseu");
    expect(noPhone.secondary).toMatchObject({ label: "Google Maps", external: true });
  });
});

describe("openStatus and meta", () => {
  it("shows the closing time while open", () => {
    expect(openStatus(partner, "ru", new Date("2026-11-27T15:00:00"))).toEqual({ open: true, label: "Открыто · до 23:00" });
    expect(openStatus({ ...partner, open_now: false }, "en", new Date("2026-11-27T15:00:00"))).toEqual({ open: false, label: "Closed" });
  });
  it("is unknown for open-data places without hours", () => {
    expect(openStatus(openData, "ru", new Date())).toBeNull();
  });
  it("builds one meta line: cuisine · price · address", () => {
    expect(placeMeta(partner, "en")).toMatch(/·.*Independence St 15A$/);
    expect(placeMeta(openData, "ro")).toBe("Str. Independenței 15A");
  });
});

describe("PopupCard and MapSheet", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("renders the photo header with rating, status and a separate close button", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(createElement(PopupCard, {
        place: partner, cover: "https://example.test/oliva.jpg", locale: "ru",
        now: new Date("2026-11-27T15:00:00"), saved: new Set(["venue-6"]), onClose,
      }));
    });
    const cover = host.querySelector(".vmap-popup-cover");
    expect(cover?.getAttribute("data-surface")).toBe("dark");
    expect(cover?.querySelector(".vmap-pill.is-rating")?.textContent).toBe("★ 4.7");
    expect(cover?.querySelector(".vmap-pill.is-open")?.textContent).toBe("Открыто · до 23:00");
    expect(cover?.querySelector(".vmap-pill.is-saved")).not.toBeNull();
    const close = cover?.querySelector<HTMLButtonElement>(".vmap-popup-close");
    expect(close?.getAttribute("aria-label")).toBe("Закрыть");
    act(() => close?.click());
    expect(onClose).toHaveBeenCalledOnce();
    const buttons = [...host.querySelectorAll(".vmap-actions .btn")].map((el) => el.className);
    expect(buttons).toEqual([expect.stringContaining("btn--primary"), expect.stringContaining("btn--secondary")]);
    expect(host.querySelector(".vmap-popup-free b")?.textContent).toBe("10");
  });

  it("falls back to a compact header without a photo", () => {
    act(() => {
      root.render(createElement(PopupCard, { place: openData, locale: "en", now: new Date(), saved: new Set<string>(), onClose: () => {} }));
    });
    expect(host.querySelector(".vmap-popup-cover")).toBeNull();
    expect(host.querySelector(".vmap-popup-title .vmap-popup-close")).not.toBeNull();
    expect(host.querySelector(".vmap-popup-free")).toBeNull();
  });

  it("switches sheet snaps from the segmented control and the handle", () => {
    const onSnap = vi.fn();
    const heights = sheetHeights(600);
    act(() => {
      root.render(createElement(MapSheet, { locale: "ro", snap: "peek", heights, count: 7, onSnap }, null));
    });
    const sheet = host.querySelector<HTMLElement>(".vmap-sheet");
    expect(sheet?.dataset.snap).toBe("peek");
    expect(sheet?.style.height).toBe(`${heights.peek}px`);
    expect(host.querySelector(".vmap-sheet-head strong")?.textContent).toBe("7 localuri");
    const segs = [...host.querySelectorAll<HTMLButtonElement>(".vmap-sheet .seg-item")];
    expect(segs.map((b) => b.textContent)).toEqual(["Hartă", "Card", "Listă"]);
    expect(segs[0].getAttribute("aria-pressed")).toBe("true");
    act(() => segs[2].click());
    expect(onSnap).toHaveBeenLastCalledWith("full");
  });
});
