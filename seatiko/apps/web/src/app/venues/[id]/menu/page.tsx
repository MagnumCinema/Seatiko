"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { QtyStepper, VenueMenuBoard, pluralLabel } from "@/components/venue-menu-board";
import { BoltIcon, MenuBookIcon, TableIcon } from "@/components/venue-icons";
import { useLocale } from "@/components/locale-provider";
import {
  ApiError,
  cancelPreorder,
  fetchMenu,
  fetchPreorder,
  fetchPreorderMenu,
  fetchVenue,
  getToken,
  mediaUrl,
  pickLocale,
  savePreorder,
  type MenuItem,
  type Order,
  type Venue,
} from "@/lib/api";
import type { MessageKey } from "@/components/locale-provider";
import { venueBookingHref } from "@/lib/booking-link";
import {
  changeSelection,
  groupMenu,
  loadMenuSelection,
  saveMenuSelection,
  selectionLines,
  selectionTotals,
  type MenuSelection,
} from "@/lib/menu";
import { getSiteCopy } from "@/lib/site-copy";

export default function VenueMenuPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const venueId = params.id;
  const preorderParam = searchParams.get("preorder");
  const isPreorder = preorderParam !== null && preorderParam !== "0";
  // `?preorder=<reservation id>` (from the booking confirmation) sends the selection to the restaurant.
  const reservationId = preorderParam && preorderParam !== "1" ? preorderParam : null;
  const tableParam = searchParams.get("table");
  const { locale, t } = useLocale();
  const cuisineLabels: Record<string, string> = getSiteCopy(locale).catalog.cuisines;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<MenuSelection>(() => loadMenuSelection(venueId));
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [preorder, setPreorder] = useState<Order | null>(null);
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  const [preorderState, setPreorderState] = useState<"idle" | "saving" | "cancelled">("idle");
  const [preorderError, setPreorderError] = useState<MessageKey | null>(null);

  // Preorder mode: load the saved preorder (it replaces the local list) and which dishes this guest may preorder.
  useEffect(() => {
    if (!reservationId) return;
    let alive = true;
    const token = getToken();
    queueMicrotask(() => {
      if (alive) setSignedIn(Boolean(token));
    });
    if (!token) return;
    Promise.all([
      fetchPreorder(reservationId).catch(() => null),
      fetchPreorderMenu(venueId).catch(() => []),
    ]).then(([saved, rules]) => {
      if (!alive) return;
      setBlocked(Object.fromEntries(rules.filter((r) => !r.orderable).map((r) => [r.id, r.blocked_reason ?? ""])));
      if (saved) {
        setPreorder(saved);
        const fromServer = Object.fromEntries(saved.items.map((line) => [line.menu_item_id, line.qty]));
        setSelection(fromServer);
        saveMenuSelection(venueId, fromServer);
      }
    });
    return () => {
      alive = false;
    };
  }, [reservationId, venueId]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError(false);
    });
    Promise.all([fetchVenue(venueId), fetchMenu(venueId).catch(() => [] as MenuItem[])])
      .then(([v, items]) => {
        if (!alive) return;
        setVenue(v);
        setMenu(items);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [venueId]);

  const categories = useMemo(() => groupMenu(menu, locale, t("menu_page.crumb")), [menu, locale, t]);
  const lines = useMemo(() => selectionLines(selection, menu), [selection, menu]);
  const totals = useMemo(() => selectionTotals(selection, menu), [selection, menu]);

  function changeQty(item: MenuItem, delta: number) {
    setSelection((prev) => {
      const next = changeSelection(prev, item.id, delta);
      saveMenuSelection(venueId, next);
      return next;
    });
  }

  const preorderLocked =
    preorder !== null &&
    (preorder.status !== "SUBMITTED" || (preorder.kitchen_at ? new Date(preorder.kitchen_at) <= new Date() : false));

  function preorderErrorKey(error: unknown): MessageKey {
    const code = error instanceof ApiError ? error.code : "";
    if (code === "preorder_closed") return "menu_page.preorder_error_closed";
    if (code === "preorder_disabled") return "menu_page.preorder_error_disabled";
    if (code === "item_unavailable") return "menu_page.preorder_error_unavailable";
    if (code === "age_verification_required") return "menu_page.preorder_error_age";
    return "menu_page.preorder_error";
  }

  async function sendPreorder() {
    if (!reservationId) return;
    const items = lines
      .filter(({ item }) => !blocked[item.id])
      .map(({ item, qty }) => ({ menu_item_id: item.id, qty }));
    if (items.length === 0) return;
    setPreorderState("saving");
    setPreorderError(null);
    try {
      setPreorder(await savePreorder(reservationId, items));
      setPreorderState("idle");
      setSelectionOpen(false);
    } catch (error) {
      setPreorderError(preorderErrorKey(error));
      setPreorderState("idle");
    }
  }

  async function dropPreorder() {
    if (!reservationId) return;
    setPreorderState("saving");
    setPreorderError(null);
    try {
      await cancelPreorder(reservationId);
      setPreorder(null);
      setPreorderState("cancelled");
    } catch (error) {
      setPreorderError(preorderErrorKey(error));
      setPreorderState("idle");
    }
  }

  function clearSelection() {
    setSelection({});
    setSelectionOpen(false);
    saveMenuSelection(venueId, {});
  }

  if (loading) {
    return (
      <div className="venue-page">
        <SiteHeader variant="solid" />
        <div className="venue-page-wrap">
          <nav className="venue-breadcrumb" aria-label={t("nav.breadcrumb")}>
            <span className="skeleton skeleton-text" style={{ width: 80 }} />
            <span aria-hidden>/</span>
            <span className="skeleton skeleton-text" style={{ width: 120 }} />
            <span aria-hidden>/</span>
            <span className="skeleton skeleton-text" style={{ width: 60 }} />
          </nav>
          <header className="menu-hero">
            <div className="menu-hero-copy">
              <span className="skeleton skeleton-text" style={{ width: 60 }} />
              <span className="skeleton skeleton-text skeleton-title" />
              <span className="skeleton skeleton-text" style={{ width: "70%" }} />
              <div className="venue-page-meta">
                <span className="skeleton skeleton-text" style={{ width: 70 }} />
                <span className="skeleton skeleton-text" style={{ width: 80 }} />
                <span className="skeleton skeleton-text" style={{ width: 90 }} />
              </div>
              <div className="menu-hero-actions">
                <span className="skeleton skeleton-btn" />
                <span className="skeleton skeleton-btn" />
              </div>
            </div>
          </header>
          <section className="venue-section menu-section">
            <div className="menu-board-skeleton">
              <div className="menu-skeleton-search" />
              <div className="menu-skeleton-chips">
                <span className="skeleton skeleton-chip" />
                <span className="skeleton skeleton-chip" />
                <span className="skeleton skeleton-chip" />
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="menu-skeleton-cat">
                  <span className="skeleton skeleton-text" style={{ width: 100 }} />
                  <div className="menu-skeleton-dishes">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="menu-skeleton-dish">
                        <div className="menu-skeleton-dish-head">
                          <span className="skeleton skeleton-text" style={{ width: `${45 + (i * j * 7) % 30}%` }} />
                          <span className="skeleton skeleton-text" style={{ width: 50 }} />
                        </div>
                        <span className="skeleton skeleton-text" style={{ width: "85%" }} />
                        <span className="skeleton skeleton-tag" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="venue-page">
        <SiteHeader variant="solid" />
        <div className="venue-page-empty">
          <h1>{t("venue.not_found")}</h1>
          <Link href="/">{t("venue.back_map")}</Link>
        </div>
      </div>
    );
  }

  const name = pickLocale(venue.name, locale);
  const venueHref = `/venues/${encodeURIComponent(venue.id)}`;
  const cover = venue.photo_urls?.[0] || venue.image_url;
  const dishCount = categories.reduce((sum, c) => sum + c.items.length, 0);
  const cuisine = venue.cuisine[0] ? (cuisineLabels[venue.cuisine[0]] ?? venue.cuisine[0]) : null;
  const dishesLabel = pluralLabel(t, locale, "menu_page.dishes", totals.count);

  return (
    <div className={`venue-page menu-page${lines.length > 0 ? " has-selection" : ""}`}>
      <SiteHeader variant="solid" />
      <div className="venue-page-wrap">
        <nav className="venue-breadcrumb" aria-label={t("nav.breadcrumb")}>
          <Link href="/">← {t("nav.map")}</Link>
          <span aria-hidden>/</span>
          <Link href={venueHref}>{name}</Link>
          <span aria-hidden>/</span>
          <span>{t("menu_page.crumb")}</span>
        </nav>

        {isPreorder ? (
          <div className="menu-preorder" role="note">
            <span className="venue-tile-icon">
              <MenuBookIcon />
            </span>
            <div>
              <strong>{t("menu_page.preorder_title")}</strong>
              <p>
                {tableParam ? `${t("menu_page.preorder_table", { table: tableParam })} ` : ""}
                {t("menu_page.preorder_body")}
              </p>
              {reservationId && !signedIn ? (
                <p className="menu-preorder-status">
                  {t("menu_page.preorder_login")}{" "}
                  <Link href={`/login?next=${encodeURIComponent(`/venues/${venueId}/menu?preorder=${reservationId}`)}`}>
                    {t("menu_page.preorder_login_cta")}
                  </Link>
                </p>
              ) : null}
              {preorder ? (
                <p className="menu-preorder-status" role="status">
                  {preorderLocked
                    ? t("menu_page.preorder_kitchen")
                    : t("menu_page.preorder_sent", {
                        time: preorder.kitchen_at
                          ? new Date(preorder.kitchen_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
                          : "",
                      })}
                  {preorder.items.some((line) => line.age_check === "PENDING_AGE_CHECK")
                    ? ` ${t("menu_page.preorder_age_pending")}`
                    : ""}
                  {!preorderLocked ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="menu-preorder-cancel"
                        disabled={preorderState === "saving"}
                        onClick={() => void dropPreorder()}
                      >
                        {t("menu_page.preorder_cancel")}
                      </button>
                    </>
                  ) : null}
                </p>
              ) : preorderState === "cancelled" ? (
                <p className="menu-preorder-status" role="status">
                  {t("menu_page.preorder_cancelled")}
                </p>
              ) : null}
              {preorderError ? (
                <p className="menu-preorder-status error" role="alert">
                  {t(preorderError)}
                </p>
              ) : null}
            </div>
            <Link className="venue-cta venue-cta-outline" href={venueHref}>
              {t("menu_page.preorder_back")}
            </Link>
          </div>
        ) : null}

        <header className="menu-hero">
          <div className="menu-hero-copy">
            <p className="venue-page-kicker">{t("menu_page.kicker")}</p>
            <h1>{name}</h1>
            <p className="venue-page-address">⌖ {pickLocale(venue.address, locale)}</p>
            <div className="venue-page-meta">
              {dishCount > 0 ? <span>{pluralLabel(t, locale, "menu_page.dishes", dishCount)}</span> : null}
              {categories.length > 0 ? (
                <span>{pluralLabel(t, locale, "menu_page.sections", categories.length)}</span>
              ) : null}
              {cuisine ? <span>{cuisine}</span> : null}
              {venue.average_check ? (
                <span>{t("menu_page.avg_check", { amount: venue.average_check })}</span>
              ) : null}
            </div>
            <div className="menu-hero-actions">
              <Link className="venue-cta venue-cta-hero" href={venueBookingHref(venue.id)}>
                <BoltIcon className="venue-cta-icon" />
                <span>{t("venue.quick_book")}</span>
              </Link>
              <Link className="venue-cta venue-cta-outline" href={`${venueHref}#venue-floor`}>
                <TableIcon className="venue-cta-icon" />
                <span>{t("venue.book_scroll")}</span>
              </Link>
            </div>
          </div>
          {cover ? (
            <div className="menu-hero-media">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote venue photos, same as the venue page */}
              <img src={mediaUrl(cover)} alt={name} />
              <span className={`venue-status-badge ${venue.open_now ? "open" : "closed"}`}>
                {venue.open_now ? t("venue.open") : t("venue.closed")}
              </span>
            </div>
          ) : null}
        </header>

        <section className="venue-section menu-section">
          <VenueMenuBoard items={menu} selection={selection} onChangeQty={changeQty} />
          {dishCount > 0 ? <p className="menu-note">{t("menu_page.price_note")}</p> : null}
        </section>

        <section className="venue-section menu-cta">
          <div>
            <h2>{t("menu_page.cta_title")}</h2>
            <p>{t("menu_page.cta_body")}</p>
          </div>
          <div className="menu-cta-actions">
            <Link className="venue-cta venue-cta-hero" href={venueBookingHref(venue.id)}>
              <BoltIcon className="venue-cta-icon" />
              <span>{t("venue.quick_book")}</span>
            </Link>
            <Link className="venue-cta ghost" href={venueHref}>
              {t("menu_page.to_venue")}
            </Link>
          </div>
        </section>
      </div>

      {lines.length > 0 ? (
        <aside className={`menu-selection${selectionOpen ? " open" : ""}`} aria-label={t("menu_page.selection_title")}>
          {selectionOpen ? (
            <div id="menu-selection-list" className="menu-selection-body">
              <ul>
                {lines.map(({ item, qty }) => {
                  const dish = pickLocale(item.name, locale);
                  return (
                    <li key={item.id} className={blocked[item.id] ? "blocked" : undefined}>
                      <span className="menu-selection-name">
                        {dish}
                        {blocked[item.id] === "age_verification_required" ? (
                          <small className="menu-selection-flag">{t("menu_page.preorder_age_blocked")}</small>
                        ) : null}
                      </span>
                      <QtyStepper item={item} qty={qty} name={dish} price={item.price} t={t} onChangeQty={changeQty} />
                      <b>{item.price * qty} MDL</b>
                    </li>
                  );
                })}
              </ul>
              <div className="menu-selection-total">
                <span>{t("menu_page.selection_total")}</span>
                <b>{totals.total} MDL</b>
              </div>
              <p className="menu-selection-hint">
                {reservationId && signedIn ? t("menu_page.preorder_hint") : t("menu_page.selection_hint")}
                {reservationId && lines.some(({ item }) => blocked[item.id] === "age_verification_required")
                  ? ` ${t("menu_page.preorder_age_hint")}`
                  : ""}
              </p>
              {reservationId && signedIn && !preorderLocked ? (
                <button
                  type="button"
                  className="venue-cta venue-cta-hero menu-selection-send"
                  disabled={preorderState === "saving" || lines.every(({ item }) => blocked[item.id])}
                  onClick={() => void sendPreorder()}
                >
                  {preorderState === "saving"
                    ? t("menu_page.preorder_saving")
                    : preorder
                      ? t("menu_page.preorder_update")
                      : t("menu_page.preorder_send")}
                </button>
              ) : null}
              <button type="button" className="menu-selection-clear" onClick={clearSelection}>
                {t("menu_page.selection_clear")}
              </button>
            </div>
          ) : null}
          <div className="menu-selection-bar">
            <div>
              <strong>{t("menu_page.selection_title")}</strong>
              <span>{t("menu_page.selection_summary", { dishes: dishesLabel, total: totals.total })}</span>
            </div>
            <button
              type="button"
              className="venue-cta venue-cta-hero"
              aria-expanded={selectionOpen}
              aria-controls="menu-selection-list"
              onClick={() => setSelectionOpen((open) => !open)}
            >
              {selectionOpen ? t("menu_page.selection_hide") : t("menu_page.selection_open")}
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
