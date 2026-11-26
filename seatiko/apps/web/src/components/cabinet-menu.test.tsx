// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItem } from "@/lib/api";

const api = vi.hoisted(() => ({
  listOwnerMenu: vi.fn(),
  stopOwnerMenuItem: vi.fn(),
  updateOwnerMenuItem: vi.fn(),
  upsertOwnerMenuItem: vi.fn(),
  deleteOwnerMenuItem: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), ...api }));

import { LocaleProvider } from "./locale-provider";
import { CabinetMenuPanel } from "./cabinet-menu";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const borsch: MenuItem = {
  id: "d1",
  venue_id: "venue-1",
  category: { ru: "Супы", en: "Soups", ro: "Supe" },
  name: { ru: "Борщ", en: "Borscht", ro: "Borș" },
  description: { ru: "Со сметаной", en: "With sour cream", ro: "Cu smântână" },
  ingredients: { ru: "Свёкла", en: "Beetroot", ro: "Sfeclă" },
  allergens: ["milk"],
  price: 65,
  weight_g: 350,
  image_url: "",
  contains_alcohol: false,
  requires_age_18: false,
  tags: ["popular", "house"],
  stopped: true,
};

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(venueId = "venue-1") {
  await act(async () => {
    root.render(createElement(LocaleProvider, null, createElement(CabinetMenuPanel, { venueId })));
  });
  await flush();
}

function click(element: Element | null | undefined) {
  if (!element) throw new Error("element not found");
  act(() => {
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

function text() {
  return document.body.textContent ?? "";
}

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((fn) => fn.mockReset());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("CabinetMenuPanel", () => {
  it("is locked until the venue is published and calls no API", async () => {
    await mount("");
    expect(text()).toContain("Меню откроется после публикации");
    expect(api.listOwnerMenu).not.toHaveBeenCalled();
  });

  it("shows a load error with a working retry", async () => {
    api.listOwnerMenu.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([borsch]);
    await mount();
    expect(text()).toContain("Не удалось загрузить меню");
    expect(text()).not.toContain("Меню пока пустое");
    click([...document.querySelectorAll("button")].find((b) => b.textContent === "Повторить"));
    await flush();
    expect(text()).toContain("Борщ");
    expect(api.listOwnerMenu).toHaveBeenCalledTimes(2);
  });

  it("offers starter categories on an empty menu", async () => {
    api.listOwnerMenu.mockResolvedValue([]);
    await mount();
    expect(text()).toContain("Меню пока пустое");
    click([...document.querySelectorAll(".cm-suggest .cm-chip")].find((b) => b.textContent === "Супы"));
    await flush();
    const inputs = [...document.querySelectorAll<HTMLInputElement>(".cm-newcat input")].map((i) => i.value);
    expect(inputs).toEqual(["Супы", "Soups", "Supe"]);
  });

  it("keeps a stopped dish stopped and every field when it is edited", async () => {
    api.listOwnerMenu.mockResolvedValue([borsch]);
    api.updateOwnerMenuItem.mockImplementation(async (_venue: string, _id: string, body: object) => ({ ...borsch, ...body }));
    await mount();
    click(document.querySelector(".cm-row-name"));
    await flush();
    type(document.querySelector(".cm-affix input"), "70");
    click(document.querySelector(".cm-editor-foot button[type=submit]"));
    await flush();
    expect(api.updateOwnerMenuItem).toHaveBeenCalledTimes(1);
    const [venueId, itemId, body] = api.updateOwnerMenuItem.mock.calls[0];
    expect(venueId).toBe("venue-1");
    expect(itemId).toBe("d1");
    expect(body).toMatchObject({
      price: 70,
      stopped: true,
      tags: ["popular", "house"],
      allergens: ["milk"],
      weight_g: 350,
      volume_ml: 0,
      name: borsch.name,
      ingredients: borsch.ingredients,
      category: borsch.category,
    });
    expect(document.querySelector(".cm-editor")).toBeNull();
    expect(text()).toContain("«Борщ» сохранено");
  });

  it("«Save & new» adds the dish and opens a fresh form in the same category", async () => {
    api.listOwnerMenu.mockResolvedValue([borsch]);
    api.upsertOwnerMenuItem.mockImplementation(async (_venue: string, body: object) => ({ ...borsch, ...body, id: "d9" }));
    await mount();
    click(document.querySelector('.cm-group-actions .cm-icon-btn'));
    await flush();
    type(document.querySelector(".cm-input-lg"), "Солянка");
    type(document.querySelector(".cm-affix input"), "70");
    click([...document.querySelectorAll(".cm-editor-foot button")].find((b) => b.textContent === "Сохранить и новое"));
    await flush();
    expect(api.upsertOwnerMenuItem).toHaveBeenCalledWith(
      "venue-1",
      expect.objectContaining({
        name: { ru: "Солянка", en: "Солянка", ro: "Солянка" },
        category: borsch.category,
        price: 70,
        stopped: false,
      }),
    );
    expect(document.querySelector(".cm-editor")).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>(".cm-input-lg")?.value).toBe("");
    expect(document.querySelector(".cm-grid .select-menu-value")?.textContent).toBe("Супы");
  });

  it("does not save an invalid price", async () => {
    api.listOwnerMenu.mockResolvedValue([borsch]);
    await mount();
    click(document.querySelector(".cm-row-name"));
    await flush();
    type(document.querySelector(".cm-affix input"), "65,5");
    click(document.querySelector(".cm-editor-foot button[type=submit]"));
    await flush();
    expect(api.updateOwnerMenuItem).not.toHaveBeenCalled();
    expect(text()).toContain("Цена — целое число леев");
  });

  it("asks before closing the editor with unsaved changes", async () => {
    api.listOwnerMenu.mockResolvedValue([borsch]);
    await mount();
    click(document.querySelector(".cm-row-name"));
    await flush();
    type(document.querySelector(".cm-affix input"), "80");
    click(document.querySelector(".cm-editor-head .cm-icon-btn"));
    expect(text()).toContain("Закрыть без сохранения?");
    expect(document.querySelector(".cm-editor")).not.toBeNull();
    click([...document.querySelectorAll(".cabinet-delete-actions button")].find((b) => b.textContent === "Не сохранять"));
    expect(document.querySelector(".cm-editor")).toBeNull();
  });

  it("switches the stop-list optimistically and rolls back on failure", async () => {
    api.listOwnerMenu.mockResolvedValue([{ ...borsch, stopped: false }]);
    api.stopOwnerMenuItem.mockRejectedValueOnce(new Error("offline"));
    await mount();
    const toggle = document.querySelector('.cm-row [role="switch"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    click(toggle);
    expect(document.querySelector('.cm-row [role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    await flush();
    expect(api.stopOwnerMenuItem).toHaveBeenCalledWith("venue-1", "d1", true);
    expect(document.querySelector('.cm-row [role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector(".owner-notice.error")).not.toBeNull();
  });

  it("filters by search, ignoring accents, and resets", async () => {
    const cheese: MenuItem = { ...borsch, id: "d2", stopped: false, name: { ru: "Брынза", en: "Cheese", ro: "Brânză" } };
    api.listOwnerMenu.mockResolvedValue([borsch, cheese]);
    await mount();
    type(document.querySelector(".cm-search input"), "branza");
    await flush();
    expect([...document.querySelectorAll(".cm-row-name")].map((b) => b.textContent)).toEqual(["Брынза"]);
    click([...document.querySelectorAll(".cm-found button")][0]);
    await flush();
    expect(document.querySelectorAll(".cm-row")).toHaveLength(2);
  });
});
