import type { LocaleCode, LocalizedString, MenuItem } from "@/lib/api";
import { wordMatches } from "@/lib/menu";

/**
 * Owner cabinet → «Меню»: pure logic behind the menu tab (categories, dish form,
 * the exact body the API expects, search, filters, counters, price format).
 */

export const MENU_LOCALES = ["ru", "en", "ro"] as const satisfies readonly LocaleCode[];

/** Allergen codes the guest dish card can name (same list as `menu-dish-popup`). */
export const ALLERGEN_CODES = [
  "gluten",
  "milk",
  "eggs",
  "fish",
  "crustaceans",
  "molluscs",
  "soy",
  "nuts",
  "peanuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
] as const;

/** Marks the guest menu shows as labels and filters. */
export const KNOWN_TAGS = ["popular", "vegetarian", "spicy"] as const;
export type KnownTag = (typeof KNOWN_TAGS)[number];

export const PRICE_MAX = 100_000;
export const PORTION_MAX = 10_000;

/** Category picker value for «new category». */
export const NEW_CATEGORY = "__new__";

/** Body of POST / PATCH `/restaurant/venues/:id/menu[/:itemId]`. PATCH replaces the dish, so every field is sent. */
export type MenuItemPayload = {
  category: LocalizedString;
  name: LocalizedString;
  description: LocalizedString;
  ingredients: LocalizedString;
  allergens: string[];
  price: number;
  weight_g: number;
  volume_ml: number;
  image_url: string;
  contains_alcohol: boolean;
  requires_age_18: boolean;
  tags: string[];
  stopped: boolean;
};

export type PortionUnit = "g" | "ml";

/** What the dish editor holds while the owner types. Numbers stay strings until saved. */
export type DishDraft = {
  name: LocalizedString;
  description: LocalizedString;
  ingredients: LocalizedString;
  /** Key of an existing category, or `NEW_CATEGORY`. */
  categoryKey: string;
  newCategory: LocalizedString;
  price: string;
  portion: string;
  portionUnit: PortionUnit;
  imageUrl: string;
  /** All tags of the dish, unknown ones included (they are kept on save). */
  tags: string[];
  allergens: string[];
  containsAlcohol: boolean;
  /** 18+ without alcohol (hookah, energy drinks…). */
  adultOnly: boolean;
  available: boolean;
};

export type MenuCategoryInfo = {
  key: string;
  names: LocalizedString;
  total: number;
  stopped: number;
  itemIds: string[];
};

export type MenuStatusFilter = "all" | "available" | "stopped" | "noPhoto" | "untranslated";

export type MenuFilterState = {
  query: string;
  status: MenuStatusFilter;
  /** Category key or "all". */
  category: string;
};

export type DraftError =
  | "required"
  | "notWhole"
  | "tooLow"
  | "tooHigh"
  | "badUrl";

export type DraftErrors = Partial<Record<"name" | "category" | "price" | "portion" | "imageUrl", DraftError>>;

// ---------- Text ----------

export function emptyText(): LocalizedString {
  return { ru: "", en: "", ro: "" };
}

export function textOf(value?: Partial<LocalizedString> | string | null): LocalizedString {
  if (!value) return emptyText();
  if (typeof value === "string") return { ru: value, en: value, ro: value };
  return { ru: value.ru ?? "", en: value.en ?? "", ro: value.ro ?? "" };
}

export function trimText(value: LocalizedString): LocalizedString {
  return { ru: value.ru.trim(), en: value.en.trim(), ro: value.ro.trim() };
}

export function isBlankText(value: LocalizedString): boolean {
  return !value.ru.trim() && !value.en.trim() && !value.ro.trim();
}

const CYRILLIC = /[Ѐ-ӿ]/;

export function hasCyrillic(text: string): boolean {
  return CYRILLIC.test(text);
}

/**
 * A language still needs a translation when its text is empty, or when the
 * English / Romanian text is Cyrillic: a copy of the Russian one.
 */
export function needsTranslation(value: LocalizedString, locale: LocaleCode): boolean {
  const text = value[locale].trim();
  if (!text) return true;
  return locale !== "ru" && hasCyrillic(text);
}

/** Languages in which a dish name (or its description, when it has one) is not translated yet. */
export function missingLocales(item: Pick<MenuItem, "name" | "description">): LocaleCode[] {
  const name = textOf(item.name);
  const description = textOf(item.description);
  const hasDescription = !isBlankText(description);
  return MENU_LOCALES.filter(
    (locale) => needsTranslation(name, locale) || (hasDescription && needsTranslation(description, locale)),
  );
}

/** Text in `locale`, falling back like the guest menu does (then any language). */
export function textIn(value: Partial<LocalizedString> | undefined, locale: LocaleCode): string {
  const text = textOf(value);
  return text[locale].trim() || text.en.trim() || text.ru.trim() || text.ro.trim();
}

/**
 * Text to save. Untouched English / Romanian copies of the Russian text follow
 * a new Russian text, and empty languages get the first filled one, so other
 * apps never show a blank name. Real translations are never overwritten.
 */
export function finalizeText(initial: LocalizedString, draft: LocalizedString): LocalizedString {
  const before = trimText(initial);
  const out = trimText(draft);
  for (const locale of ["en", "ro"] as const) {
    const untouched = out[locale] === before[locale];
    const wasCopy = before[locale] !== "" && before[locale] === before.ru && hasCyrillic(before[locale]);
    if (untouched && wasCopy && out.ru !== before.ru && out.ru) out[locale] = out.ru;
  }
  const fallback = out.ru || out.en || out.ro;
  for (const locale of MENU_LOCALES) if (!out[locale]) out[locale] = fallback;
  return out;
}

/** Lower case, no diacritics, ё = е: "Brânză" and "branza" match. */
export function foldText(text: string): string {
  return text.toLocaleLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ё/g, "е");
}

// ---------- Categories ----------

/** Grouping key: the Russian name (like the stored data), else English, else Romanian. */
export function categoryKeyOf(category: Partial<LocalizedString> | undefined): string {
  const text = textOf(category);
  return text.ru.trim() || text.en.trim() || text.ro.trim();
}

/** Categories in menu order (the order the API returns dishes), with counters. */
export function menuCategories(items: MenuItem[]): MenuCategoryInfo[] {
  const byKey = new Map<string, MenuCategoryInfo>();
  for (const item of items) {
    const key = categoryKeyOf(item.category);
    let info = byKey.get(key);
    if (!info) {
      info = { key, names: trimText(textOf(item.category)), total: 0, stopped: 0, itemIds: [] };
      byKey.set(key, info);
    }
    info.total += 1;
    if (item.stopped) info.stopped += 1;
    info.itemIds.push(item.id);
  }
  return [...byKey.values()];
}

/** An existing category whose name matches `names` in any language (case and accents ignored). */
export function findCategoryByName(categories: MenuCategoryInfo[], names: LocalizedString): MenuCategoryInfo | undefined {
  const wanted = MENU_LOCALES.map((locale) => foldText(names[locale].trim())).filter(Boolean);
  if (wanted.length === 0) return undefined;
  return categories.find((category) =>
    MENU_LOCALES.some((locale) => {
      const own = foldText(category.names[locale].trim());
      return own !== "" && wanted.includes(own);
    }),
  );
}

// ---------- Dish form ----------

export function emptyDraft(categoryKey: string, newCategory: LocalizedString = emptyText()): DishDraft {
  return {
    name: emptyText(),
    description: emptyText(),
    ingredients: emptyText(),
    categoryKey,
    newCategory,
    price: "",
    portion: "",
    portionUnit: "g",
    imageUrl: "",
    tags: [],
    allergens: [],
    containsAlcohol: false,
    adultOnly: false,
    available: true,
  };
}

export function draftFromItem(item: MenuItem): DishDraft {
  const volume = item.volume_ml && item.volume_ml > 0 ? item.volume_ml : 0;
  const weight = item.weight_g && item.weight_g > 0 ? item.weight_g : 0;
  return {
    name: textOf(item.name),
    description: textOf(item.description),
    ingredients: textOf(item.ingredients),
    categoryKey: categoryKeyOf(item.category),
    newCategory: emptyText(),
    price: Number.isFinite(item.price) ? String(item.price) : "",
    // Guests see millilitres when both are set, so the form edits that one.
    portion: volume ? String(volume) : weight ? String(weight) : "",
    portionUnit: volume ? "ml" : "g",
    imageUrl: item.image_url ?? "",
    tags: [...(item.tags ?? [])],
    allergens: [...(item.allergens ?? [])],
    containsAlcohol: !!item.contains_alcohol,
    adultOnly: !!item.requires_age_18 && !item.contains_alcohol,
    available: !item.stopped,
  };
}

/** A new dish prefilled from `item`; `suffix` is added to the name in each language. */
export function duplicateDraft(item: MenuItem, suffix: LocalizedString): DishDraft {
  const draft = draftFromItem(item);
  const name = textOf(item.name);
  return {
    ...draft,
    name: {
      ru: name.ru ? `${name.ru}${suffix.ru}` : "",
      en: name.en ? `${name.en}${suffix.en}` : "",
      ro: name.ro ? `${name.ro}${suffix.ro}` : "",
    },
  };
}

export function draftsEqual(a: DishDraft, b: DishDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hasTag(draft: Pick<DishDraft, "tags">, tag: string): boolean {
  return draft.tags.includes(tag);
}

export function toggleTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
}

export function toggleAllergen(allergens: string[], code: string): string[] {
  if (allergens.includes(code)) return allergens.filter((a) => a !== code);
  const order = (value: string) => {
    const index = (ALLERGEN_CODES as readonly string[]).indexOf(value);
    return index === -1 ? ALLERGEN_CODES.length : index;
  };
  return [...allergens, code].sort((a, b) => order(a) - order(b));
}

/**
 * Whole number typed by the owner: spaces (also "1 250") are ignored.
 * Returns null for an empty field, "notWhole" for decimals and anything that is not an integer.
 */
export function parseWholeNumber(raw: string): number | null | "notWhole" {
  const value = raw.replace(/[\s  ]/g, "");
  if (!value) return null;
  if (!/^-?\d+$/.test(value)) return "notWhole";
  return Number(value);
}

const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export function validateDraft(draft: DishDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (isBlankText(draft.name)) errors.name = "required";
  if (draft.categoryKey === NEW_CATEGORY && isBlankText(draft.newCategory)) errors.category = "required";

  const price = parseWholeNumber(draft.price);
  if (price === null) errors.price = "required";
  else if (price === "notWhole") errors.price = "notWhole";
  else if (price <= 0) errors.price = "tooLow";
  else if (price > PRICE_MAX) errors.price = "tooHigh";

  const portion = parseWholeNumber(draft.portion);
  if (portion === "notWhole") errors.portion = "notWhole";
  else if (portion !== null && portion <= 0) errors.portion = "tooLow";
  else if (portion !== null && portion > PORTION_MAX) errors.portion = "tooHigh";

  const url = draft.imageUrl.trim();
  if (url && !URL_RE.test(url) && !url.startsWith("/")) errors.imageUrl = "badUrl";
  return errors;
}

/** Category names to save for the draft: an existing category, or the new one (merged into a same-named existing one). */
export function draftCategory(draft: DishDraft, categories: MenuCategoryInfo[]): LocalizedString {
  if (draft.categoryKey !== NEW_CATEGORY) {
    const existing = categories.find((category) => category.key === draft.categoryKey);
    return existing ? { ...existing.names } : finalizeText(emptyText(), { ru: draft.categoryKey, en: "", ro: "" });
  }
  const typed = trimText(draft.newCategory);
  const same = findCategoryByName(categories, typed);
  return same ? { ...same.names } : finalizeText(emptyText(), typed);
}

/** The exact API body for a draft. `initial` is the draft as the editor opened it (for translation copies). */
export function draftToPayload(draft: DishDraft, initial: DishDraft, categories: MenuCategoryInfo[]): MenuItemPayload {
  const price = parseWholeNumber(draft.price);
  const portion = parseWholeNumber(draft.portion);
  const amount = typeof portion === "number" ? portion : 0;
  const description = finalizeText(initial.description, draft.description);
  const ingredients = finalizeText(initial.ingredients, draft.ingredients);
  return {
    category: draftCategory(draft, categories),
    name: finalizeText(initial.name, draft.name),
    description,
    ingredients,
    allergens: [...draft.allergens],
    price: typeof price === "number" ? price : 0,
    weight_g: draft.portionUnit === "g" ? amount : 0,
    volume_ml: draft.portionUnit === "ml" ? amount : 0,
    image_url: draft.imageUrl.trim(),
    contains_alcohol: draft.containsAlcohol,
    requires_age_18: draft.containsAlcohol || draft.adultOnly,
    tags: [...draft.tags],
    stopped: !draft.available,
  };
}

/** Full body that re-saves `item` unchanged except `overrides` (category moves, renames). */
export function itemToPayload(item: MenuItem, overrides: Partial<MenuItemPayload> = {}): MenuItemPayload {
  return {
    category: textOf(item.category),
    name: textOf(item.name),
    description: textOf(item.description),
    ingredients: textOf(item.ingredients),
    allergens: [...(item.allergens ?? [])],
    price: item.price,
    weight_g: item.weight_g ?? 0,
    volume_ml: item.volume_ml ?? 0,
    image_url: item.image_url ?? "",
    contains_alcohol: !!item.contains_alcohol,
    requires_age_18: !!item.requires_age_18 || !!item.contains_alcohol,
    tags: [...(item.tags ?? [])],
    stopped: !!item.stopped,
    ...overrides,
  };
}

/** A menu item built from a payload, for the guest-menu preview. */
export function previewItem(payload: MenuItemPayload, venueId: string, id = "preview"): MenuItem {
  return {
    id,
    venue_id: venueId,
    category: payload.category,
    name: payload.name,
    description: payload.description,
    ingredients: payload.ingredients,
    allergens: payload.allergens,
    price: payload.price,
    weight_g: payload.weight_g || undefined,
    volume_ml: payload.volume_ml || undefined,
    image_url: payload.image_url || undefined,
    contains_alcohol: payload.contains_alcohol,
    requires_age_18: payload.requires_age_18,
    tags: payload.tags,
    stopped: payload.stopped,
  };
}

/** Another dish already uses this name (any language, case and accents ignored). */
export function findSameName(items: MenuItem[], name: LocalizedString, exceptId?: string): MenuItem | undefined {
  const wanted = MENU_LOCALES.map((locale) => foldText(name[locale].trim())).filter(Boolean);
  if (wanted.length === 0) return undefined;
  return items.find(
    (item) =>
      item.id !== exceptId &&
      MENU_LOCALES.some((locale) => {
        const own = foldText(textOf(item.name)[locale].trim());
        return own !== "" && wanted.includes(own);
      }),
  );
}

// ---------- Search, filters, counters ----------

/** Search words: folded, split on spaces. */
export function searchWords(query: string): string[] {
  return foldText(query).split(/\s+/).filter(Boolean);
}

const haystacks = new WeakMap<MenuItem, string[]>();

/** Words of the dish name, description, ingredients and category in every language, plus its price (cached per item). */
function dishWords(item: MenuItem): string[] {
  let words = haystacks.get(item);
  if (!words) {
    const parts: string[] = [String(item.price)];
    for (const value of [item.name, item.description, item.ingredients, item.category]) {
      const text = textOf(value);
      parts.push(text.ru, text.en, text.ro);
    }
    words = foldText(parts.join(" ")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    haystacks.set(item, words);
  }
  return words;
}

/**
 * Every search word matches a word of the dish in any language (or its price),
 * tolerating word endings like the guest menu search: "брынза" finds "брынзой".
 */
export function dishMatches(item: MenuItem, words: string[]): boolean {
  if (words.length === 0) return true;
  const haystack = dishWords(item);
  return words.every((word) => wordMatches(word, haystack));
}

export function matchesStatus(item: MenuItem, status: MenuStatusFilter): boolean {
  if (status === "available") return !item.stopped;
  if (status === "stopped") return !!item.stopped;
  if (status === "noPhoto") return !item.image_url?.trim();
  if (status === "untranslated") return missingLocales(item).length > 0;
  return true;
}

export function filterDishes(items: MenuItem[], filters: MenuFilterState): MenuItem[] {
  const words = searchWords(filters.query);
  return items.filter(
    (item) =>
      (filters.category === "all" || categoryKeyOf(item.category) === filters.category) &&
      matchesStatus(item, filters.status) &&
      dishMatches(item, words),
  );
}

export function isFiltered(filters: MenuFilterState): boolean {
  return filters.query.trim() !== "" || filters.status !== "all" || filters.category !== "all";
}

export type MenuStats = { total: number; available: number; stopped: number; noPhoto: number; untranslated: number };

export function menuStats(items: MenuItem[]): MenuStats {
  const stats: MenuStats = { total: items.length, available: 0, stopped: 0, noPhoto: 0, untranslated: 0 };
  for (const item of items) {
    if (item.stopped) stats.stopped += 1;
    else stats.available += 1;
    if (!item.image_url?.trim()) stats.noPhoto += 1;
    if (missingLocales(item).length > 0) stats.untranslated += 1;
  }
  return stats;
}

/** Dishes grouped by category in menu order; categories without matching dishes are left out. */
export function groupByCategory(
  items: MenuItem[],
  categories: MenuCategoryInfo[],
): { category: MenuCategoryInfo; items: MenuItem[] }[] {
  const byKey = new Map<string, MenuItem[]>();
  for (const item of items) {
    const key = categoryKeyOf(item.category);
    const list = byKey.get(key);
    if (list) list.push(item);
    else byKey.set(key, [item]);
  }
  return categories
    .filter((category) => byKey.has(category.key))
    .map((category) => ({ category, items: byKey.get(category.key)! }));
}

// ---------- Formatting ----------

const NUMBER_LOCALES: Record<LocaleCode, string> = { ru: "ru-RU", en: "en-US", ro: "ro-RO" };

/** "1 250" / "1,250" / "1.250" — whole lei with the locale's grouping. */
export function formatAmount(value: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(NUMBER_LOCALES[locale] ?? "en-US", { maximumFractionDigits: 0 }).format(value);
}

/** "1 250 MDL". */
export function formatPrice(value: number, locale: LocaleCode): string {
  return `${formatAmount(value, locale)} MDL`;
}

// ---------- Batches ----------

/** Runs `task` for every item, a few at a time; failures are collected instead of stopping the batch. */
export async function runBatch<T>(
  items: T[],
  task: (item: T) => Promise<unknown>,
  concurrency = 4,
): Promise<{ ok: T[]; failed: T[] }> {
  const ok: T[] = [];
  const failed: T[] = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await task(item);
        ok.push(item);
      } catch {
        failed.push(item);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { ok, failed };
}
