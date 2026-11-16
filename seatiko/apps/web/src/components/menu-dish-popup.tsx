"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useLocale, type MessageKey } from "@/components/locale-provider";
import { FlameIcon, LeafIcon } from "@/components/venue-icons";
import { mediaUrl, pickLocale, type MenuItem } from "@/lib/api";
import { hasTag, portionOf } from "@/lib/menu";
import { useDialogFocus } from "@/lib/use-dialog-focus";

const ALLERGEN_KEYS: Record<string, MessageKey> = {
  gluten: "menu_page.allergen_gluten",
  milk: "menu_page.allergen_milk",
  eggs: "menu_page.allergen_eggs",
  fish: "menu_page.allergen_fish",
  crustaceans: "menu_page.allergen_crustaceans",
  soy: "menu_page.allergen_soy",
  nuts: "menu_page.allergen_nuts",
  peanuts: "menu_page.allergen_peanuts",
  celery: "menu_page.allergen_celery",
  mustard: "menu_page.allergen_mustard",
  sesame: "menu_page.allergen_sesame",
  sulphites: "menu_page.allergen_sulphites",
  molluscs: "menu_page.allergen_molluscs",
};

export function allergenLabel(t: ReturnType<typeof useLocale>["t"], code: string) {
  const key = ALLERGEN_KEYS[code];
  return key ? t(key) : code;
}

/** Andy's-style dish detail: photo, composition, allergens, add to selection. */
export function MenuDishPopup({
  item,
  qty,
  open,
  onClose,
  onChangeQty,
}: {
  item: MenuItem | null;
  qty: number;
  open: boolean;
  onClose: () => void;
  onChangeQty: (item: MenuItem, delta: number) => void;
}) {
  const { locale, t } = useLocale();
  const dialogRef = useRef<HTMLElement>(null);
  const openToken = open && item ? item.id : null;
  const [syncedToken, setSyncedToken] = useState<string | null>(null);
  const [localQty, setLocalQty] = useState(1);

  if (openToken !== syncedToken) {
    setSyncedToken(openToken);
    if (item && openToken) setLocalQty(Math.max(1, qty || 1));
  }

  useDialogFocus(open, dialogRef, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !item || typeof document === "undefined") return null;

  const dish = item;
  const name = pickLocale(dish.name, locale);
  const description = pickLocale(dish.description, locale);
  const ingredients = pickLocale(dish.ingredients, locale) || description;
  const photo = dish.image_url ? mediaUrl(dish.image_url) : "";
  const portion = portionOf(dish);
  const allergens = dish.allergens ?? [];
  const lineTotal = dish.price * localQty;

  function commitAndClose() {
    const delta = localQty - qty;
    if (delta !== 0) onChangeQty(dish, delta);
    onClose();
  }

  return createPortal(
    <div className="booking-popup-root menu-dish-popup-root" role="presentation">
      <button type="button" className="booking-popup-backdrop" aria-label={t("res.close")} onClick={onClose} />
      <section
        ref={dialogRef}
        className="booking-popup menu-dish-popup"
        role="dialog"
        aria-modal="true"
        aria-label={t("menu_page.dish_dialog")}
        aria-labelledby="menu-dish-popup-title"
      >
        <div className="booking-popup-card menu-dish-popup-card">
          <button type="button" className="booking-popup-x menu-dish-popup-x" onClick={onClose} aria-label={t("res.close")} data-autofocus>
            ×
          </button>

          <div className="menu-dish-popup-layout">
            {photo ? (
              <div className="menu-dish-popup-media">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote dish photos from the API / Unsplash */}
                <img src={photo} alt={name} />
              </div>
            ) : null}

            <div className="menu-dish-popup-copy">
              <div className="menu-dish-popup-top">
                <h2 id="menu-dish-popup-title">{name}</h2>
                {portion ? (
                  <p className="menu-dish-popup-portion">
                    {t(portion.unit === "g" ? "menu_page.portion_g" : "menu_page.portion_ml", { amount: portion.amount })}
                  </p>
                ) : null}
                <div className="menu-dish-popup-tags">
                  {hasTag(dish, "popular") ? <span className="menu-tag popular">{t("menu_page.tag_popular")}</span> : null}
                  {hasTag(dish, "vegetarian") ? (
                    <span className="menu-tag veg">
                      <LeafIcon className="menu-tag-icon" />
                      {t("menu_page.tag_vegetarian")}
                    </span>
                  ) : null}
                  {hasTag(dish, "spicy") ? (
                    <span className="menu-tag spicy">
                      <FlameIcon className="menu-tag-icon" />
                      {t("menu_page.tag_spicy")}
                    </span>
                  ) : null}
                  {dish.contains_alcohol ? (
                    <span className="menu-tag adult" title={t("menu_page.tag_alcohol_label")}>
                      {t("menu_page.tag_alcohol")}
                    </span>
                  ) : null}
                </div>
              </div>

              {ingredients ? (
                <div className="menu-dish-popup-block">
                  <h3>{t("menu_page.ingredients")}</h3>
                  <p>{ingredients}</p>
                </div>
              ) : null}

              <div className="menu-dish-popup-allergens">
                <span className="menu-dish-popup-alert" aria-hidden>
                  !
                </span>
                <div>
                  <strong>{t("menu_page.allergens")}</strong>
                  {allergens.length > 0 ? (
                    <p>{allergens.map((code) => allergenLabel(t, code)).join(", ")}.</p>
                  ) : (
                    <p>{t("menu_page.allergens_none")}</p>
                  )}
                </div>
              </div>

              <div className="menu-dish-popup-actions">
                <div className="menu-stepper menu-dish-popup-stepper">
                  <button
                    type="button"
                    aria-label={t("menu_page.less_label", { dish: name })}
                    disabled={localQty <= 1}
                    onClick={() => setLocalQty((n) => Math.max(1, n - 1))}
                  >
                    −
                  </button>
                  <output aria-live="polite">{localQty}</output>
                  <button
                    type="button"
                    aria-label={t("menu_page.more_label", { dish: name })}
                    onClick={() => setLocalQty((n) => Math.min(99, n + 1))}
                  >
                    +
                  </button>
                </div>
                <button type="button" className="venue-cta venue-cta-hero menu-dish-popup-add" onClick={commitAndClose}>
                  <span>{t("menu_page.add_to_selection")}</span>
                  <b>
                    {lineTotal} <small>MDL</small>
                  </b>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
