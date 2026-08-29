"use client";

import { useMemo } from "react";
import { pickLocale, type LocaleCode, type MenuItem } from "@/lib/api";

const CATEGORY_ORDER = [
  "Закуски",
  "Супы",
  "Салаты",
  "Основное",
  "Основные",
  "Паста",
  "Пицца",
  "Гарниры",
  "Десерты",
  "Напитки",
  "Бар",
];

export function groupMenuByCategory(items: MenuItem[], locale: LocaleCode) {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    if (item.stopped) continue;
    const cat = pickLocale(item.category, locale) || "Меню";
    const list = groups.get(cat) ?? [];
    list.push(item);
    groups.set(cat, list);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function VenueMenu({
  items,
  locale,
  compact = false,
  onAdd,
}: {
  items: MenuItem[];
  locale: LocaleCode;
  compact?: boolean;
  onAdd?: (item: MenuItem) => void;
}) {
  const groups = useMemo(
    () => groupMenuByCategory(items, locale),
    [items, locale],
  );

  if (groups.length === 0) {
    return (
      <p className="venue-menu-empty">
        Меню пока не опубликовано. Загляните ближе к визиту или спросите у
        персонала.
      </p>
    );
  }

  return (
    <div className={`venue-menu ${compact ? "compact" : ""}`}>
      {groups.map(([category, dishes]) => (
        <section key={category} className="venue-menu-cat">
          <h3>{category}</h3>
          <ul>
            {dishes.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{pickLocale(item.name, locale)}</strong>
                  {pickLocale(item.description, locale) ? (
                    <p>{pickLocale(item.description, locale)}</p>
                  ) : null}
                  {item.contains_alcohol ? (
                    <span className="venue-menu-tag">Алкоголь 18+</span>
                  ) : null}
                </div>
                <div className="venue-menu-price">
                  <b>{item.price} MDL</b>
                  {onAdd ? (
                    <button type="button" className="fa-mini" onClick={() => onAdd(item)}>
                      В заказ
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
