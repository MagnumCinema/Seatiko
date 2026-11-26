"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, type MessageKey } from "@/components/locale-provider";
import { MenuDishPopup } from "@/components/menu-dish-popup";
import { FlameIcon, LeafIcon, SearchIcon } from "@/components/venue-icons";
import { mediaUrl, pickLocale, type LocaleCode, type MenuItem } from "@/lib/api";
import {
  EMPTY_MENU_FILTERS,
  countDishes,
  filterMenu,
  groupMenu,
  hasTag,
  isFiltering,
  portionOf,
  type MenuCategory,
  type MenuFilters,
  type MenuSelection,
} from "@/lib/menu";

type Translate = ReturnType<typeof useLocale>["t"];

/** "5 блюд" / "1 section" with the locale's plural rules. */
export function pluralLabel(
  t: Translate,
  locale: LocaleCode,
  base: "menu_page.dishes" | "menu_page.sections",
  count: number,
) {
  const form = new Intl.PluralRules(locale).select(count);
  return t(`${base}_${form}` as MessageKey, { count });
}

const ACTIVE_LINE_PX = 180;

type ToggleKey = "popular" | "vegetarian" | "noAlcohol";

const TOGGLES: { key: ToggleKey; label: MessageKey }[] = [
  { key: "popular", label: "menu_page.filter_popular" },
  { key: "vegetarian", label: "menu_page.filter_vegetarian" },
  { key: "noAlcohol", label: "menu_page.filter_no_alcohol" },
];

export function VenueMenuBoard({
  items,
  selection,
  onChangeQty,
}: {
  items: MenuItem[];
  selection: MenuSelection;
  onChangeQty: (item: MenuItem, delta: number) => void;
}) {
  const { locale, t } = useLocale();
  const [filters, setFilters] = useState<MenuFilters>(EMPTY_MENU_FILTERS);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [openDishId, setOpenDishId] = useState<string | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  // While a chip jump is animating, ignore scroll-spy so the active chip
  // does not flicker through every section we pass on the way.
  const jumpLockRef = useRef<string | null>(null);
  const jumpUnlockTimerRef = useRef<number | null>(null);

  const categories = useMemo(
    () => groupMenu(items, locale, t("menu_page.crumb")),
    [items, locale, t],
  );
  const visible = useMemo(
    () => filterMenu(categories, filters, locale),
    [categories, filters, locale],
  );
  const filtering = isFiltering(filters);
  const hasAlcohol = categories.some((c) => c.items.some((i) => i.contains_alcohol));
  const toggles = TOGGLES.filter(({ key }) => {
    if (key === "noAlcohol") return hasAlcohol;
    const tag = key === "popular" ? "popular" : "vegetarian";
    return categories.some((c) => c.items.some((i) => hasTag(i, tag)));
  });
  const currentKey = visible.some((c) => c.key === activeKey) ? activeKey : visible[0]?.key ?? null;

  function clearJumpLock() {
    jumpLockRef.current = null;
    if (jumpUnlockTimerRef.current !== null) {
      window.clearTimeout(jumpUnlockTimerRef.current);
      jumpUnlockTimerRef.current = null;
    }
  }

  useEffect(() => {
    const root = categoriesRef.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (jumpLockRef.current) return;
      const sections = [...root.querySelectorAll<HTMLElement>("[data-menu-cat]")];
      if (sections.length === 0) return;
      // Below the header and the sticky chips bar.
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= ACTIVE_LINE_PX) current = section;
      }
      const last = sections[sections.length - 1];
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom && last.getBoundingClientRect().top < window.innerHeight) current = last;
      setActiveKey((prev) => (prev === current.id ? prev : current.id));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", clearJumpLock);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", clearJumpLock);
      cancelAnimationFrame(frame);
      clearJumpLock();
    };
  }, [visible]);

  useEffect(() => {
    const nav = chipsRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-chip="${currentKey}"]`);
    if (!nav || !chip) return;
    const left = chip.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + chip.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });
    }
  }, [currentKey]);

  function jumpTo(category: MenuCategory) {
    jumpLockRef.current = category.key;
    setActiveKey(category.key);
    document.getElementById(category.key)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (jumpUnlockTimerRef.current !== null) window.clearTimeout(jumpUnlockTimerRef.current);
    // Fallback when the browser has no `scrollend` (or it never fires).
    jumpUnlockTimerRef.current = window.setTimeout(clearJumpLock, 900);
  }

  if (categories.length === 0) {
    return (
      <div className="menu-empty">
        <h2>{t("menu_page.empty_title")}</h2>
        <p>{t("menu_page.empty_body")}</p>
      </div>
    );
  }

  return (
    <div className="menu-board">
      <div className="menu-tools">
        <label className="menu-search">
          <SearchIcon className="menu-search-icon" />
          <input
            type="search"
            aria-label={t("menu_page.search_label")}
            value={filters.query}
            placeholder={t("menu_page.search_placeholder")}
            onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
          />
          {filters.query ? (
            <button
              type="button"
              className="menu-search-clear"
              aria-label={t("menu_page.search_clear")}
              onClick={() => setFilters((prev) => ({ ...prev, query: "" }))}
            >
              ×
            </button>
          ) : null}
        </label>
        {toggles.length > 0 ? (
          <div className="menu-toggles" role="group" aria-label={t("menu_page.filters_label")}>
            {toggles.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`menu-toggle${filters[key] ? " on" : ""}`}
                aria-pressed={filters[key]}
                onClick={() => setFilters((prev) => ({ ...prev, [key]: !prev[key] }))}
              >
                {key === "vegetarian" ? <LeafIcon className="menu-toggle-icon" /> : null}
                {t(label)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {visible.length > 0 ? (
        <div className="menu-toolbar">
          <nav ref={chipsRef} className="menu-chips" aria-label={t("menu_page.cats_label")}>
            {visible.map((category) => (
              <a
                key={category.key}
                href={`#${category.key}`}
                data-chip={category.key}
                className={`menu-chip${category.key === currentKey ? " on" : ""}`}
                aria-current={category.key === currentKey ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  jumpTo(category);
                }}
              >
                {category.title}
                <span>{category.items.length}</span>
              </a>
            ))}
          </nav>
        </div>
      ) : null}

      <p className="menu-found" aria-live="polite">
        {filtering && visible.length > 0
          ? t("menu_page.found", { dishes: pluralLabel(t, locale, "menu_page.dishes", countDishes(visible)) })
          : ""}
      </p>

      {visible.length === 0 ? (
        <div className="menu-empty">
          <h2>{t("menu_page.nothing_title")}</h2>
          <p>{t("menu_page.nothing_body")}</p>
          <button type="button" className="venue-cta venue-cta-outline" onClick={() => setFilters(EMPTY_MENU_FILTERS)}>
            {t("menu_page.reset")}
          </button>
        </div>
      ) : (
        <div ref={categoriesRef} className="menu-categories">
          {visible.map((category) => (
            <section key={category.key} id={category.key} data-menu-cat className="menu-cat" aria-labelledby={`${category.key}-title`}>
              <div className="menu-cat-head">
                <h2 id={`${category.key}-title`}>{category.title}</h2>
                <span>{pluralLabel(t, locale, "menu_page.dishes", category.items.length)}</span>
              </div>
              <ul className="menu-dishes">
                {category.items.map((item) => (
                  <MenuDish
                    key={item.id}
                    item={item}
                    qty={selection[item.id] ?? 0}
                    locale={locale}
                    t={t}
                    onChangeQty={onChangeQty}
                    onOpen={() => setOpenDishId(item.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <MenuDishPopup
        item={items.find((item) => item.id === openDishId) ?? null}
        qty={openDishId ? selection[openDishId] ?? 0 : 0}
        open={openDishId !== null}
        onClose={() => setOpenDishId(null)}
        onChangeQty={onChangeQty}
      />
    </div>
  );
}

export function QtyStepper({
  item,
  qty,
  name,
  price,
  t,
  onChangeQty,
}: {
  item: MenuItem;
  qty: number;
  name: string;
  price: number;
  t: Translate;
  onChangeQty: (item: MenuItem, delta: number) => void;
}) {
  const total = qty * price;
  return (
    <div className="menu-stepper">
      <button type="button" aria-label={t("menu_page.less_label", { dish: name })} onClick={() => onChangeQty(item, -1)}>
        −
      </button>
      <output aria-live="polite">{qty}</output>
      <span className="menu-stepper-total">{total} MDL</span>
      <button type="button" aria-label={t("menu_page.more_label", { dish: name })} onClick={() => onChangeQty(item, 1)}>
        +
      </button>
    </div>
  );
}

/** One dish card of the guest menu (also the owner's preview in the cabinet). */
export function MenuDish({
  item,
  qty,
  locale,
  t,
  onChangeQty,
  onOpen,
}: {
  item: MenuItem;
  qty: number;
  locale: LocaleCode;
  t: Translate;
  onChangeQty: (item: MenuItem, delta: number) => void;
  onOpen: () => void;
}) {
  const name = pickLocale(item.name, locale);
  const description = pickLocale(item.description, locale);
  const portion = portionOf(item);

  const photo = item.image_url ? mediaUrl(item.image_url) : "";

  return (
    <li className={`menu-dish${qty > 0 ? " picked" : ""}${photo ? " has-photo" : ""}`}>
      <button
        type="button"
        className="menu-dish-open"
        onClick={onOpen}
        aria-label={t("menu_page.open_dish", { dish: name })}
      >
        {photo ? (
          <div className="menu-dish-media" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element -- remote dish photos from the API / Unsplash */}
            <img src={photo} alt="" loading="lazy" decoding="async" />
          </div>
        ) : null}
        <div className="menu-dish-body">
          <div className="menu-dish-head">
            <h3>{name}</h3>
            <span className="menu-dish-leader" aria-hidden />
            <span className="menu-dish-price">
              {item.price} <small>MDL</small>
            </span>
          </div>
          {description ? <p className="menu-dish-desc">{description}</p> : null}
          <div className="menu-dish-tags">
            {portion ? (
              <span className="menu-dish-portion">
                {t(portion.unit === "g" ? "menu_page.portion_g" : "menu_page.portion_ml", { amount: portion.amount })}
              </span>
            ) : null}
            {hasTag(item, "popular") ? (
              <span className="menu-tag popular">{t("menu_page.tag_popular")}</span>
            ) : null}
            {hasTag(item, "vegetarian") ? (
              <span className="menu-tag veg" title={t("menu_page.tag_vegetarian")}>
                <LeafIcon className="menu-tag-icon" />
                {t("menu_page.tag_vegetarian")}
              </span>
            ) : null}
            {hasTag(item, "spicy") ? (
              <span className="menu-tag spicy">
                <FlameIcon className="menu-tag-icon" />
                {t("menu_page.tag_spicy")}
              </span>
            ) : null}
            {item.contains_alcohol ? (
              <span className="menu-tag adult" title={t("menu_page.tag_alcohol_label")} aria-label={t("menu_page.tag_alcohol_label")}>
                {t("menu_page.tag_alcohol")}
              </span>
            ) : null}
          </div>
        </div>
      </button>
      <div className="menu-dish-foot">
        {qty > 0 ? (
          <QtyStepper item={item} qty={qty} name={name} price={item.price} t={t} onChangeQty={onChangeQty} />
        ) : (
          <button
            type="button"
            className="menu-add"
            aria-label={t("menu_page.add_label", { dish: name })}
            onClick={() => onChangeQty(item, 1)}
          >
            <span aria-hidden>+</span> {t("menu_page.add")} · {item.price} MDL
          </button>
        )}
      </div>
    </li>
  );
}
