import { describe, expect, it } from "vitest";
import type { MenuItem } from "./api";
import {
  NEW_CATEGORY,
  categoryKeyOf,
  dishMatches,
  draftFromItem,
  draftToPayload,
  draftsEqual,
  duplicateDraft,
  emptyDraft,
  emptyText,
  filterDishes,
  finalizeText,
  findCategoryByName,
  findSameName,
  foldText,
  formatPrice,
  groupByCategory,
  isFiltered,
  itemToPayload,
  menuCategories,
  menuStats,
  missingLocales,
  needsTranslation,
  parseWholeNumber,
  previewItem,
  runBatch,
  searchWords,
  textIn,
  toggleAllergen,
  toggleTag,
  validateDraft,
} from "./cabinet-menu";

const soups = { ru: "Супы", en: "Soups", ro: "Supe" };
const drinks = { ru: "Напитки", en: "Drinks", ro: "Băuturi" };

function dish(id: string, overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    venue_id: "venue-1",
    category: soups,
    name: { ru: `Блюдо ${id}`, en: `Dish ${id}`, ro: `Preparat ${id}` },
    description: { ru: "", en: "", ro: "" },
    price: 50,
    contains_alcohol: false,
    ...overrides,
  };
}

describe("translations", () => {
  it("treats empty and Cyrillic English / Romanian text as not translated", () => {
    const value = { ru: "Борщ", en: "Борщ", ro: "" };
    expect(needsTranslation(value, "ru")).toBe(false);
    expect(needsTranslation(value, "en")).toBe(true);
    expect(needsTranslation(value, "ro")).toBe(true);
    expect(needsTranslation({ ru: "Tiramisu", en: "Tiramisu", ro: "Tiramisu" }, "en")).toBe(false);
  });

  it("checks the description only when the dish has one", () => {
    expect(missingLocales(dish("a"))).toEqual([]);
    expect(missingLocales(dish("a", { description: { ru: "Со сметаной", en: "With sour cream", ro: "Со сметаной" } }))).toEqual(["ro"]);
    expect(missingLocales(dish("a", { name: { ru: "Борщ", en: "", ro: "Borș" } }))).toEqual(["en"]);
  });

  it("falls back like the guest menu", () => {
    expect(textIn({ ru: "Борщ", en: "", ro: "" }, "ro")).toBe("Борщ");
    expect(textIn({ ru: "Борщ", en: "Borscht", ro: "" }, "ro")).toBe("Borscht");
    expect(textIn({ ru: "", en: "", ro: "Borș" }, "ru")).toBe("Borș");
  });

  it("keeps real translations and fills empty languages on save", () => {
    const initial = { ru: "Борщ", en: "Borscht", ro: "Borș" };
    expect(finalizeText(initial, { ru: "Зелёный борщ", en: "Borscht", ro: "Borș" })).toEqual({
      ru: "Зелёный борщ",
      en: "Borscht",
      ro: "Borș",
    });
    expect(finalizeText(emptyText(), { ru: " Борщ ", en: "", ro: "" })).toEqual({ ru: "Борщ", en: "Борщ", ro: "Борщ" });
    expect(finalizeText(emptyText(), { ru: "", en: "", ro: "Borș" })).toEqual({ ru: "Borș", en: "Borș", ro: "Borș" });
  });

  it("lets untouched Russian copies follow a new Russian text", () => {
    const initial = { ru: "Борщ", en: "Борщ", ro: "Borș" };
    expect(finalizeText(initial, { ru: "Зелёный борщ", en: "Борщ", ro: "Borș" })).toEqual({
      ru: "Зелёный борщ",
      en: "Зелёный борщ",
      ro: "Borș",
    });
    // Same Latin text in every language is a real name, not a copy.
    expect(finalizeText({ ru: "Tiramisu", en: "Tiramisu", ro: "Tiramisu" }, { ru: "Тирамису", en: "Tiramisu", ro: "Tiramisu" })).toEqual({
      ru: "Тирамису",
      en: "Tiramisu",
      ro: "Tiramisu",
    });
  });

  it("folds case, diacritics and ё", () => {
    expect(foldText("Brânză Ёжик")).toBe("branza ежик");
  });
});

describe("categories", () => {
  const items = [
    dish("a", { category: drinks }),
    dish("b", { stopped: true }),
    dish("c", { category: drinks }),
    dish("d", { category: { ru: "", en: "Specials", ro: "" } }),
  ];

  it("keeps menu order and counts dishes and stopped ones", () => {
    const categories = menuCategories(items);
    expect(categories.map((c) => c.key)).toEqual(["Напитки", "Супы", "Specials"]);
    expect(categories[0]).toMatchObject({ total: 2, stopped: 0, itemIds: ["a", "c"] });
    expect(categories[1]).toMatchObject({ total: 1, stopped: 1 });
  });

  it("finds a category by any of its names", () => {
    const categories = menuCategories(items);
    expect(findCategoryByName(categories, { ru: "", en: "drinks", ro: "" })?.key).toBe("Напитки");
    expect(findCategoryByName(categories, { ru: "", en: "", ro: "bauturi" })?.key).toBe("Напитки");
    expect(findCategoryByName(categories, { ru: "Десерты", en: "", ro: "" })).toBeUndefined();
    expect(findCategoryByName(categories, emptyText())).toBeUndefined();
  });

  it("uses Russian, then English, then Romanian as the key", () => {
    expect(categoryKeyOf({ ru: " Супы ", en: "Soups", ro: "" })).toBe("Супы");
    expect(categoryKeyOf({ ru: "", en: "Soups", ro: "Supe" })).toBe("Soups");
    expect(categoryKeyOf(undefined)).toBe("");
  });

  it("groups filtered dishes in category order", () => {
    const groups = groupByCategory([items[2], items[1]], menuCategories(items));
    expect(groups.map((g) => [g.category.key, g.items.map((i) => i.id)])).toEqual([
      ["Напитки", ["c"]],
      ["Супы", ["b"]],
    ]);
  });
});

describe("dish form", () => {
  const wine = dish("w", {
    category: drinks,
    name: { ru: "Красное вино", en: "Red wine", ro: "Vin roșu" },
    description: { ru: "Бокал", en: "Glass", ro: "Pahar" },
    ingredients: { ru: "Каберне", en: "Cabernet", ro: "Cabernet" },
    allergens: ["sulphites"],
    price: 85,
    volume_ml: 150,
    image_url: "https://example.com/wine.jpg",
    contains_alcohol: true,
    requires_age_18: true,
    tags: ["popular", "house-pick"],
    stopped: true,
  });

  it("round-trips every field the API keeps, so an edit loses nothing", () => {
    const draft = draftFromItem(wine);
    expect(draft).toMatchObject({ portion: "150", portionUnit: "ml", available: false, adultOnly: false });
    const payload = draftToPayload(draft, draft, menuCategories([wine]));
    expect(payload).toEqual({
      category: drinks,
      name: wine.name,
      description: wine.description,
      ingredients: wine.ingredients,
      allergens: ["sulphites"],
      price: 85,
      weight_g: 0,
      volume_ml: 150,
      image_url: "https://example.com/wine.jpg",
      contains_alcohol: true,
      requires_age_18: true,
      tags: ["popular", "house-pick"],
      // Editing a stopped dish keeps it stopped.
      stopped: true,
    });
  });

  it("sends empty values so cleared fields are really cleared", () => {
    const draft = draftFromItem(wine);
    const cleared = { ...draft, allergens: [], imageUrl: "  ", portion: "", tags: [] };
    const payload = draftToPayload(cleared, draft, menuCategories([wine]));
    expect(payload).toMatchObject({ allergens: [], image_url: "", weight_g: 0, volume_ml: 0, tags: [] });
  });

  it("keeps 18+ for non-alcoholic dishes", () => {
    const hookah = dish("h", { requires_age_18: true });
    const draft = draftFromItem(hookah);
    expect(draft.adultOnly).toBe(true);
    expect(draftToPayload(draft, draft, menuCategories([hookah])).requires_age_18).toBe(true);
  });

  it("saves a new category, reusing a same-named existing one", () => {
    const categories = menuCategories([wine]);
    const typed = { ...emptyDraft(NEW_CATEGORY, { ru: "Десерты", en: "Desserts", ro: "" }), name: { ru: "Торт", en: "", ro: "" }, price: "50" };
    expect(draftToPayload(typed, typed, categories).category).toEqual({ ru: "Десерты", en: "Desserts", ro: "Десерты" });
    const same = { ...typed, newCategory: { ru: "", en: "drinks", ro: "" } };
    expect(draftToPayload(same, same, categories).category).toEqual(drinks);
  });

  it("validates name, category, price, portion and photo link", () => {
    expect(validateDraft(emptyDraft(NEW_CATEGORY))).toEqual({ name: "required", category: "required", price: "required" });
    const base = { ...emptyDraft("Супы"), name: { ru: "Борщ", en: "", ro: "" } };
    expect(validateDraft({ ...base, price: "45.5" }).price).toBe("notWhole");
    expect(validateDraft({ ...base, price: "0" }).price).toBe("tooLow");
    expect(validateDraft({ ...base, price: "-5" }).price).toBe("tooLow");
    expect(validateDraft({ ...base, price: "250000" }).price).toBe("tooHigh");
    expect(validateDraft({ ...base, price: "1 250" })).toEqual({});
    expect(validateDraft({ ...base, price: "45", portion: "2,5" }).portion).toBe("notWhole");
    expect(validateDraft({ ...base, price: "45", portion: "0" }).portion).toBe("tooLow");
    expect(validateDraft({ ...base, price: "45", imageUrl: "photo.jpg" }).imageUrl).toBe("badUrl");
    expect(validateDraft({ ...base, price: "45", imageUrl: "https://cdn.example.com/a.jpg" })).toEqual({});
    expect(validateDraft({ ...base, price: "45", imageUrl: "/uploads/menu/a.jpg" })).toEqual({});
  });

  it("parses whole numbers with spaces", () => {
    expect(parseWholeNumber("")).toBeNull();
    expect(parseWholeNumber("1 250")).toBe(1250);
    expect(parseWholeNumber("12,5")).toBe("notWhole");
    expect(parseWholeNumber("abc")).toBe("notWhole");
  });

  it("duplicates a dish as a new one with a suffix in every language", () => {
    const copy = duplicateDraft(wine, { ru: " (копия)", en: " (copy)", ro: " (copie)" });
    expect(copy.name).toEqual({ ru: "Красное вино (копия)", en: "Red wine (copy)", ro: "Vin roșu (copie)" });
    expect(copy.price).toBe("85");
  });

  it("detects unsaved changes", () => {
    const draft = draftFromItem(wine);
    expect(draftsEqual(draft, draftFromItem(wine))).toBe(true);
    expect(draftsEqual(draft, { ...draft, price: "90" })).toBe(false);
  });

  it("toggles tags and keeps allergens in the guest card order", () => {
    expect(toggleTag(["popular"], "spicy")).toEqual(["popular", "spicy"]);
    expect(toggleTag(["popular", "spicy"], "popular")).toEqual(["spicy"]);
    expect(toggleAllergen(["milk"], "gluten")).toEqual(["gluten", "milk"]);
    expect(toggleAllergen(["custom", "milk"], "eggs")).toEqual(["milk", "eggs", "custom"]);
    expect(toggleAllergen(["gluten", "milk"], "gluten")).toEqual(["milk"]);
  });

  it("re-saves an item unchanged except the overrides", () => {
    const payload = itemToPayload(wine, { category: soups });
    expect(payload).toMatchObject({ category: soups, name: wine.name, stopped: true, volume_ml: 150, weight_g: 0, tags: ["popular", "house-pick"] });
  });

  it("builds a guest preview item", () => {
    const draft = draftFromItem(wine);
    const item = previewItem(draftToPayload(draft, draft, menuCategories([wine])), "venue-1");
    expect(item).toMatchObject({ id: "preview", volume_ml: 150, weight_g: undefined, image_url: "https://example.com/wine.jpg" });
  });

  it("finds a dish with the same name", () => {
    const items = [wine, dish("b")];
    expect(findSameName(items, { ru: "", en: "red WINE", ro: "" })?.id).toBe("w");
    expect(findSameName(items, { ru: "", en: "red wine", ro: "" }, "w")).toBeUndefined();
  });
});

describe("search and filters", () => {
  const items = [
    dish("a", { name: { ru: "Брынза с зеленью", en: "Cheese with herbs", ro: "Brânză cu verdeață" }, price: 85 }),
    dish("b", { category: drinks, ingredients: { ru: "Мята, лайм", en: "Mint, lime", ro: "Mentă, lime" }, stopped: true, image_url: "x" }),
    dish("c", { name: { ru: "Борщ", en: "Борщ", ro: "Borș" } }),
  ];

  it("matches any language, ingredients, category and price, ignoring accents", () => {
    expect(dishMatches(items[0], searchWords("branza"))).toBe(true);
    expect(dishMatches(items[0], searchWords("зеленью брынза"))).toBe(true);
    expect(dishMatches(items[1], searchWords("лайм"))).toBe(true);
    expect(dishMatches(items[1], searchWords("drinks"))).toBe(true);
    expect(dishMatches(items[0], searchWords("85"))).toBe(true);
    expect(dishMatches(items[0], searchWords("пицца"))).toBe(false);
  });

  it("combines search, status and category", () => {
    const all = { query: "", status: "all" as const, category: "all" };
    expect(filterDishes(items, all)).toHaveLength(3);
    expect(filterDishes(items, { ...all, status: "stopped" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterDishes(items, { ...all, status: "available" }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterDishes(items, { ...all, status: "noPhoto" }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterDishes(items, { ...all, status: "untranslated" }).map((i) => i.id)).toEqual(["c"]);
    expect(filterDishes(items, { ...all, category: "Супы" }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(isFiltered(all)).toBe(false);
    expect(isFiltered({ ...all, query: " " })).toBe(false);
    expect(isFiltered({ ...all, category: "Супы" })).toBe(true);
  });

  it("counts the menu", () => {
    expect(menuStats(items)).toEqual({ total: 3, available: 2, stopped: 1, noPhoto: 2, untranslated: 1 });
  });
});

describe("formatPrice", () => {
  it("groups thousands per language and keeps MDL on the same line", () => {
    expect(formatPrice(85, "ru")).toBe("85 MDL");
    expect(formatPrice(1250, "en")).toBe("1,250 MDL");
    expect(formatPrice(12500, "ru").replace(/\s/g, " ")).toBe("12 500 MDL");
  });
});

describe("runBatch", () => {
  it("runs every item and collects failures", async () => {
    let running = 0;
    let peak = 0;
    const result = await runBatch(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        if (n % 3 === 0) throw new Error("nope");
      },
      2,
    );
    expect(result.ok.sort()).toEqual([1, 2, 4, 5]);
    expect(result.failed.sort()).toEqual([3, 6]);
    expect(peak).toBe(2);
  });

  it("handles an empty batch", async () => {
    expect(await runBatch([], async () => undefined)).toEqual({ ok: [], failed: [] });
  });
});
