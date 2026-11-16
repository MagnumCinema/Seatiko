import { describe, expect, it } from "vitest";
import type { MenuItem } from "./api";
import {
  EMPTY_MENU_FILTERS,
  changeSelection,
  countDishes,
  filterMenu,
  groupMenu,
  portionOf,
  selectionLines,
  selectionTotals,
} from "./menu";

function dish(id: string, overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    venue_id: "venue-1",
    category: { ru: "Супы", en: "Soups", ro: "Supe" },
    name: { ru: `Блюдо ${id}`, en: `Dish ${id}`, ro: `Preparat ${id}` },
    description: { ru: "", en: "", ro: "" },
    price: 50,
    contains_alcohol: false,
    ...overrides,
  };
}

const salads = { ru: "Салаты", en: "Salads", ro: "Salate" };
const wine = { ru: "Вино", en: "Wine", ro: "Vin" };

describe("groupMenu", () => {
  it("keeps the API order of categories and dishes and skips stopped dishes", () => {
    const groups = groupMenu(
      [
        dish("a", { category: salads }),
        dish("b"),
        dish("c", { category: salads }),
        dish("d", { stopped: true }),
        dish("e", { category: wine }),
      ],
      "en",
      "Menu",
    );
    expect(groups.map((g) => g.title)).toEqual(["Salads", "Soups", "Wine"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b"]);
    expect(groups.map((g) => g.key)).toEqual(["menu-cat-1", "menu-cat-2", "menu-cat-3"]);
  });

  it("puts dishes without a category under the fallback title", () => {
    const groups = groupMenu([dish("a", { category: { ru: "", en: "", ro: "" } })], "ru", "Меню");
    expect(groups[0].title).toBe("Меню");
  });
});

describe("filterMenu", () => {
  const groups = groupMenu(
    [
      dish("borsch", { name: { ru: "Зелёный борщ", en: "Green borscht", ro: "Borș verde" }, tags: ["popular"] }),
      dish("salad", { category: salads, name: { ru: "Салат с брынзой", en: "Cheese salad", ro: "Salată cu brânză" }, tags: ["vegetarian"] }),
      dish("red", { category: wine, name: { ru: "Красное вино", en: "Red wine", ro: "Vin roșu" }, contains_alcohol: true }),
    ],
    "ru",
    "Меню",
  );

  it("returns everything when nothing is filtered", () => {
    expect(filterMenu(groups, EMPTY_MENU_FILTERS, "ru")).toBe(groups);
  });

  it("matches words regardless of case, ё and diacritics", () => {
    const ru = filterMenu(groups, { ...EMPTY_MENU_FILTERS, query: "зеленый БОРЩ" }, "ru");
    expect(countDishes(ru)).toBe(1);
    const ro = filterMenu(groupMenu(groups.flatMap((g) => g.items), "ro", "Meniu"), { ...EMPTY_MENU_FILTERS, query: "branza" }, "ro");
    expect(ro.flatMap((g) => g.items.map((i) => i.id))).toEqual(["salad"]);
  });

  it("tolerates word endings but not unrelated short words", () => {
    const withMushrooms = groupMenu(
      [
        dish("tag", { description: { ru: "С белыми грибами", en: "With porcini mushrooms", ro: "Cu hribi" } }),
        dish("other", { description: { ru: "С гранатом", en: "With pomegranate", ro: "Cu rodie" } }),
      ],
      "ru",
      "Меню",
    );
    const ids = (query: string) =>
      filterMenu(withMushrooms, { ...EMPTY_MENU_FILTERS, query }, "ru").flatMap((g) => g.items.map((i) => i.id));
    expect(ids("грибы")).toEqual(["tag"]);
    expect(ids("гриб")).toEqual(["tag"]);
    expect(ids("гр")).toEqual(["tag", "other"]);
    expect(ids("гранит")).toEqual([]);
  });

  it("searches by category title too", () => {
    expect(countDishes(filterMenu(groups, { ...EMPTY_MENU_FILTERS, query: "вино" }, "ru"))).toBe(1);
  });

  it("applies the toggles and drops empty categories", () => {
    const popular = filterMenu(groups, { ...EMPTY_MENU_FILTERS, popular: true }, "ru");
    expect(popular.map((g) => g.title)).toEqual(["Супы"]);
    const veg = filterMenu(groups, { ...EMPTY_MENU_FILTERS, vegetarian: true }, "ru");
    expect(veg.map((g) => g.title)).toEqual(["Салаты"]);
    const soft = filterMenu(groups, { ...EMPTY_MENU_FILTERS, noAlcohol: true }, "ru");
    expect(countDishes(soft)).toBe(2);
  });
});

describe("portionOf", () => {
  it("prefers millilitres for drinks and grams for food", () => {
    expect(portionOf(dish("a", { weight_g: 250 }))).toEqual({ unit: "g", amount: 250 });
    expect(portionOf(dish("b", { volume_ml: 330 }))).toEqual({ unit: "ml", amount: 330 });
    expect(portionOf(dish("c"))).toBeNull();
  });
});

describe("selection", () => {
  const items = [dish("a", { price: 45 }), dish("b", { price: 120 }), dish("c", { price: 30, stopped: true })];

  it("adds, removes and clamps portions", () => {
    let sel = changeSelection({}, "a", 1);
    sel = changeSelection(sel, "a", 1);
    sel = changeSelection(sel, "b", 1);
    expect(sel).toEqual({ a: 2, b: 1 });
    sel = changeSelection(sel, "b", -1);
    expect(sel).toEqual({ a: 2 });
    expect(changeSelection({ a: 99 }, "a", 1)).toEqual({ a: 99 });
  });

  it("totals only dishes still on the menu, in menu order", () => {
    const sel = { b: 1, a: 2, c: 3, gone: 4 };
    expect(selectionLines(sel, items).map((l) => l.item.id)).toEqual(["a", "b"]);
    expect(selectionTotals(sel, items)).toEqual({ count: 3, total: 210 });
  });
});
