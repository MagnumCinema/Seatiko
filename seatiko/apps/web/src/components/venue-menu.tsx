"use client";

import { useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import { pickLocale, type LocaleCode, type MenuItem } from "@/lib/api";
import { groupMenu } from "@/lib/menu";

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
  const { t } = useLocale();
  const groups = useMemo(
    () => groupMenu(items, locale, t("menu_page.crumb")),
    [items, locale, t],
  );

  if (groups.length === 0) {
    return <p className="venue-menu-empty">{t("menu_page.empty_body")}</p>;
  }

  return (
    <div className={`venue-menu ${compact ? "compact" : ""}`}>
      {groups.map(({ key, title, items: dishes }) => (
        <section key={key} className="venue-menu-cat">
          <h3>{title}</h3>
          <ul>
            {dishes.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{pickLocale(item.name, locale)}</strong>
                  {pickLocale(item.description, locale) ? (
                    <p>{pickLocale(item.description, locale)}</p>
                  ) : null}
                  {item.contains_alcohol ? (
                    <span className="venue-menu-tag">{t("menu_page.tag_alcohol")}</span>
                  ) : null}
                </div>
                <div className="venue-menu-price">
                  <b>{item.price} MDL</b>
                  {onAdd ? (
                    <button type="button" className="fa-mini" onClick={() => onAdd(item)}>
                      {t("menu.add")}
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
