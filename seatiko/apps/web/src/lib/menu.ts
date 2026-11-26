import { pickLocale, type LocaleCode, type MenuItem } from "@/lib/api";

export type MenuTag = "popular" | "vegetarian" | "spicy";

export type MenuFilters = {
  query: string;
  popular: boolean;
  vegetarian: boolean;
  noAlcohol: boolean;
};

export const EMPTY_MENU_FILTERS: MenuFilters = {
  query: "",
  popular: false,
  vegetarian: false,
  noAlcohol: false,
};

export type MenuCategory = {
  /** Stable DOM-safe key (index based), used for anchors. */
  key: string;
  title: string;
  items: MenuItem[];
};

/** Selected dishes on this device: menu item id → portions. */
export type MenuSelection = Record<string, number>;

export function hasTag(item: MenuItem, tag: MenuTag): boolean {
  return item.tags?.includes(tag) ?? false;
}

/**
 * Groups visible dishes by category, keeping the order the API returns
 * (the restaurant's own menu order) for both categories and dishes.
 */
export function groupMenu(items: MenuItem[], locale: LocaleCode, fallbackTitle: string): MenuCategory[] {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    if (item.stopped) continue;
    const title = pickLocale(item.category, locale).trim() || fallbackTitle;
    const list = groups.get(title);
    if (list) list.push(item);
    else groups.set(title, [item]);
  }
  return [...groups.entries()].map(([title, list], index) => ({
    key: `menu-cat-${index + 1}`,
    title,
    items: list,
  }));
}

function normalize(text: string): string {
  return text.toLocaleLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ё/g, "е");
}

/**
 * A query word matches a text word when they share a long enough prefix, so
 * "грибы" finds "грибами" and "tomato" finds "tomatoes" without a stemmer.
 */
export function wordMatches(query: string, words: string[]): boolean {
  const len = query.length;
  const need = len <= 4 ? len : len <= 6 ? len - 1 : len - 2;
  return words.some((word) => {
    if (word.includes(query)) return true;
    let common = 0;
    while (common < query.length && common < word.length && query[common] === word[common]) common++;
    return common >= need;
  });
}

export function isFiltering(filters: MenuFilters): boolean {
  return filters.query.trim() !== "" || filters.popular || filters.vegetarian || filters.noAlcohol;
}

/** Applies search and toggles to grouped categories; empty categories are dropped. */
export function filterMenu(categories: MenuCategory[], filters: MenuFilters, locale: LocaleCode): MenuCategory[] {
  if (!isFiltering(filters)) return categories;
  const words = normalize(filters.query).split(/\s+/).filter(Boolean);
  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        if (filters.popular && !hasTag(item, "popular")) return false;
        if (filters.vegetarian && !hasTag(item, "vegetarian")) return false;
        if (filters.noAlcohol && item.contains_alcohol) return false;
        if (words.length === 0) return true;
        const haystack = normalize(
          [category.title, pickLocale(item.name, locale), pickLocale(item.description, locale)].join(" "),
        ).split(/[^\p{L}\p{N}]+/u);
        return words.every((word) => wordMatches(word, haystack));
      }),
    }))
    .filter((category) => category.items.length > 0);
}

export function countDishes(categories: MenuCategory[]): number {
  return categories.reduce((sum, category) => sum + category.items.length, 0);
}

/** Portion size: grams for food, millilitres for drinks; null when unknown. */
export function portionOf(item: MenuItem): { unit: "g" | "ml"; amount: number } | null {
  if (item.volume_ml && item.volume_ml > 0) return { unit: "ml", amount: item.volume_ml };
  if (item.weight_g && item.weight_g > 0) return { unit: "g", amount: item.weight_g };
  return null;
}

export function changeSelection(selection: MenuSelection, itemId: string, delta: number): MenuSelection {
  const next = { ...selection };
  const qty = Math.max(0, Math.min(99, (next[itemId] ?? 0) + delta));
  if (qty === 0) delete next[itemId];
  else next[itemId] = qty;
  return next;
}

/** Selected lines in menu order; ids no longer on the menu are skipped. */
export function selectionLines(selection: MenuSelection, items: MenuItem[]) {
  return items
    .filter((item) => !item.stopped && (selection[item.id] ?? 0) > 0)
    .map((item) => ({ item, qty: selection[item.id] }));
}

export function selectionTotals(selection: MenuSelection, items: MenuItem[]) {
  return selectionLines(selection, items).reduce(
    (acc, line) => ({ count: acc.count + line.qty, total: acc.total + line.qty * line.item.price }),
    { count: 0, total: 0 },
  );
}

const SELECTION_KEY_PREFIX = "seatiko_menu_selection:";

export function loadMenuSelection(venueId: string): MenuSelection {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SELECTION_KEY_PREFIX + venueId);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: MenuSelection = {};
    for (const [id, qty] of Object.entries(parsed)) {
      if (typeof qty === "number" && Number.isInteger(qty) && qty > 0) out[id] = Math.min(qty, 99);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMenuSelection(venueId: string, selection: MenuSelection) {
  if (typeof window === "undefined") return;
  try {
    const key = SELECTION_KEY_PREFIX + venueId;
    if (Object.keys(selection).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(selection));
  } catch {
    /* storage unavailable (private mode): selection just isn't kept */
  }
}
