"use client";

/*
 * Presentational pieces of the home map (components/venue-map.tsx): list rows,
 * the selected-place card, the map popup card, centred state cards and the
 * phone bottom sheet. Strings come from site-copy (`venueMap`, `homeMap`).
 */
import Link from "next/link";
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { pickLocale, priceLevelLabel, type LocaleCode, type MapPlace } from "@/lib/api";
import { venueBookingHref } from "@/lib/booking-link";
import { googleMapDirections, googleMapSearch } from "@/lib/google-map";
import { closingTime, isSavedPlace, nearestSnap, pluralForm, type SheetSnap } from "@/lib/home-map";
import { getSiteCopy } from "@/lib/site-copy";

export function mapCopy(locale: LocaleCode) {
  const site = getSiteCopy(locale);
  return { vm: site.venueMap, hm: site.homeMap, site };
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Search for an open-data place by name and address (it has no Google place id). */
export function placeSearchUrl(place: MapPlace, locale: LocaleCode) {
  return googleMapSearch([pickLocale(place.name, locale), pickLocale(place.address, locale)].filter(Boolean).join(", "), place.google_place_id);
}

export function freeTablesLabel(locale: LocaleCode, count: number): string {
  return pluralForm(mapCopy(locale).vm.freeTables, locale, count);
}

/** One line under the name: cuisine · price · address (open data: address only). */
export function placeMeta(place: MapPlace, locale: LocaleCode): string {
  const { site } = mapCopy(locale);
  const cuisines = site.catalog.cuisines as Record<string, string>;
  const parts: string[] = [];
  if (place.in_database && place.cuisine?.length) {
    parts.push(place.cuisine.slice(0, 2).map((item) => cuisines[item] ?? item).join(", "));
  }
  if (place.in_database && typeof place.price_level === "number") parts.push(priceLevelLabel(place.price_level));
  const address = pickLocale(place.address, locale);
  if (address) parts.push(address);
  return parts.join(" · ");
}

/** "Открыто · до 23:00" / "Открыто" / "Закрыто"; null when the status is unknown (open data). */
export function openStatus(place: MapPlace, locale: LocaleCode, now: Date): { open: boolean; label: string } | null {
  const { hm } = mapCopy(locale);
  if (typeof place.open_now !== "boolean") return null;
  if (!place.open_now) return { open: false, label: hm.closedNow };
  const until = place.venue_id ? closingTime({ id: place.venue_id, hours_text: place.hours_text }, now) : null;
  return { open: true, label: until ? fill(hm.openUntil, { time: until }) : hm.openNow };
}

type PlaceAction = { href: string; label: string; external?: boolean };

/** The two buttons of a place: book + details for partners, directions + call/maps for open data. */
export function placeActions(place: MapPlace, locale: LocaleCode): { primary: PlaceAction; secondary: PlaceAction | null } {
  const { vm, hm } = mapCopy(locale);
  const venueId = place.in_database ? place.venue_id : undefined;
  if (venueId) {
    const details = { href: `/venues/${encodeURIComponent(venueId)}`, label: hm.details };
    if (place.bookable) return { primary: { href: venueBookingHref(venueId), label: hm.book }, secondary: details };
    return { primary: details, secondary: { href: googleMapDirections(place), label: vm.route, external: true } };
  }
  const route = { href: googleMapDirections(place), label: vm.route, external: true };
  if (place.phone) return { primary: route, secondary: { href: `tel:${place.phone.replace(/[^+\d]/g, "")}`, label: vm.callVenue } };
  return { primary: route, secondary: { href: placeSearchUrl(place, locale), label: hm.googleMaps, external: true } };
}

function ExternalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

export function ActionLink({ action, variant, size = "sm", className = "" }: { action: PlaceAction; variant: "primary" | "secondary"; size?: "sm" | "md"; className?: string }) {
  const cls = `btn btn--${variant} btn--${size} ${className}`.trim();
  if (action.external) {
    return (
      <a className={cls} href={action.href} target="_blank" rel="noreferrer">
        <span>{action.label}</span>
        <ExternalIcon />
      </a>
    );
  }
  if (action.href.startsWith("tel:")) return <a className={cls} href={action.href}>{action.label}</a>;
  return <Link className={cls} href={action.href}>{action.label}</Link>;
}

/** Photo thumbnail; partners without a photo get their initial, open-data places a quiet dashed tile. */
export function PlaceThumb({ place, cover, locale, size }: { place: MapPlace; cover?: string; locale: LocaleCode; size: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const style = { "--vmap-thumb": `${size}px` } as CSSProperties;
  if (cover && broken !== cover) {
    return (
      <span className="vmap-thumb" style={style} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote venue photos */}
        <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setBroken(cover)} />
      </span>
    );
  }
  if (place.in_database) {
    const initial = pickLocale(place.name, locale).trim().charAt(0).toUpperCase();
    return <span className="vmap-thumb is-initial" style={style} aria-hidden="true">{initial}</span>;
  }
  return <span className="vmap-thumb is-open-data" style={style} aria-hidden="true"><i /></span>;
}

function HeartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21.2 3.9 13.3a5.2 5.2 0 0 1 7.4-7.4l.7.7.7-.7a5.2 5.2 0 0 1 7.4 7.4z" />
    </svg>
  );
}

export function PlaceBadge({ place, locale }: { place: MapPlace; locale: LocaleCode }) {
  const { vm, hm } = mapCopy(locale);
  if (place.in_database && place.bookable && place.venue_id) {
    const free = place.free_tables ?? 0;
    return (
      <span className={`vmap-badge${free > 0 ? " is-free" : ""}`} title={`${free} ${freeTablesLabel(locale, free)}`}>
        <span aria-hidden="true">{free} {vm.freeShort}</span>
        <span className="sr-only">{free} {freeTablesLabel(locale, free)}</span>
      </span>
    );
  }
  if (!place.in_database && typeof place.rating === "number") {
    return <span className="vmap-badge is-muted">★ {place.rating.toFixed(1)}</span>;
  }
  return <span className="vmap-badge is-muted">{hm.noBooking}</span>;
}

export function PlaceRow({
  place, cover, locale, saved, active, hovered, recommended, rowRef, onSelect, onHover,
}: {
  place: MapPlace;
  cover?: string;
  locale: LocaleCode;
  saved: ReadonlySet<string>;
  active: boolean;
  hovered: boolean;
  recommended?: boolean;
  rowRef?: (node: HTMLButtonElement | null) => void;
  onSelect: (place: MapPlace) => void;
  onHover?: (id: string | null) => void;
}) {
  const { hm } = mapCopy(locale);
  const isSaved = isSavedPlace(place, saved);
  return (
    <button
      type="button"
      ref={rowRef}
      data-place-id={place.id}
      aria-pressed={active}
      className={["vmap-row", active ? "is-active" : "", hovered ? "is-hovered" : "", recommended ? "is-recommended" : ""].filter(Boolean).join(" ")}
      onClick={() => onSelect(place)}
      onMouseEnter={onHover ? () => onHover(place.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(place.id) : undefined}
      onBlur={onHover ? () => onHover(null) : undefined}
    >
      <PlaceThumb place={place} cover={cover} locale={locale} size={46} />
      <span className="vmap-row-info">
        <span className="vmap-row-name">
          <span>{pickLocale(place.name, locale)}</span>
          {isSaved ? <span className="vmap-heart" title={hm.saved}><HeartIcon /><span className="sr-only">{hm.saved}</span></span> : null}
        </span>
        <span className="vmap-row-meta">{placeMeta(place, locale) || (place.in_database ? "" : mapCopy(locale).vm.openData)}</span>
      </span>
      <PlaceBadge place={place} locale={locale} />
    </button>
  );
}

export function RowSkeletons({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="vmap-row is-skeleton" aria-hidden="true">
          <span className="vmap-thumb" style={{ "--vmap-thumb": "46px" } as CSSProperties} />
          <span className="vmap-row-info"><i /><i /></span>
        </span>
      ))}
    </>
  );
}

/** The selected place pinned at the bottom of the rail (desktop) and in the sheet (phone). */
export function SelectedCard({
  place, cover, locale, now, compact = false,
}: {
  place: MapPlace;
  cover?: string;
  locale: LocaleCode;
  now: Date;
  compact?: boolean;
}) {
  const { vm } = mapCopy(locale);
  const actions = placeActions(place, locale);
  const status = openStatus(place, locale, now);
  const sub = [pickLocale(place.address, locale), typeof place.rating === "number" ? `★ ${place.rating.toFixed(1)}` : ""].filter(Boolean).join(" · ");
  return (
    <div className={`vmap-selected${compact ? " is-compact" : ""}`} aria-label={vm.nearby}>
      <div className="vmap-selected-head">
        <PlaceThumb place={place} cover={cover} locale={locale} size={compact ? 44 : 56} />
        <div className="vmap-selected-text">
          <strong>{pickLocale(place.name, locale)}</strong>
          <span>{sub || (status?.label ?? "")}</span>
        </div>
        {compact ? <ActionLink action={actions.primary} variant="primary" /> : <PlaceBadge place={place} locale={locale} />}
      </div>
      {!compact ? (
        <>
          {status ? (
            <div className={`vmap-selected-status${status.open ? " is-open" : ""}`}>
              <i aria-hidden="true" /> <span>{status.label}</span>
            </div>
          ) : null}
          <div className="vmap-actions">
            <ActionLink action={actions.primary} variant="primary" />
            {actions.secondary ? <ActionLink action={actions.secondary} variant="secondary" /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Map popup (M2): photo header with rating + open pills and a clear ×, one-line meta, free tables, two buttons. */
export function PopupCard({
  place, cover, locale, now, saved, onClose,
}: {
  place: MapPlace;
  cover?: string;
  locale: LocaleCode;
  now: Date;
  saved: ReadonlySet<string>;
  onClose: () => void;
}) {
  const { vm, hm } = mapCopy(locale);
  const [broken, setBroken] = useState<string | null>(null);
  const hasCover = Boolean(cover && broken !== cover);
  const actions = placeActions(place, locale);
  const status = openStatus(place, locale, now);
  const meta = placeMeta(place, locale);
  const rating = typeof place.rating === "number" ? `★ ${place.rating.toFixed(1)}` : null;
  const free = place.in_database && place.bookable ? place.free_tables ?? 0 : null;
  const close = (
    <button type="button" className="btn btn--ghost btn--icon btn--sm vmap-popup-close" aria-label={hm.closePopup} title={hm.closePopup} onClick={onClose}>
      <CloseIcon />
    </button>
  );
  const pills = (
    <>
      {rating ? <span className="vmap-pill is-rating">{rating}</span> : null}
      {status ? <span className={`vmap-pill ${status.open ? "is-open" : "is-closed"}`}>{status.label}</span> : null}
      {isSavedPlace(place, saved) ? <span className="vmap-pill is-saved"><HeartIcon /><span className="sr-only">{hm.saved}</span></span> : null}
    </>
  );
  return (
    <div className={`vmap-popup-card${hasCover ? " has-cover" : ""}`} role="dialog" aria-label={pickLocale(place.name, locale)}>
      {hasCover ? (
        <div className="vmap-popup-cover" data-surface="dark">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote venue photos */}
          <img src={cover} alt="" decoding="async" onError={() => setBroken(cover ?? null)} />
          <div className="vmap-popup-pills">{pills}</div>
          {close}
        </div>
      ) : null}
      <div className="vmap-popup-body">
        <div className="vmap-popup-title">
          <strong>{pickLocale(place.name, locale)}</strong>
          {!hasCover ? close : null}
        </div>
        {!hasCover && (rating || status) ? <div className="vmap-popup-pills is-inline">{pills}</div> : null}
        <div className="vmap-popup-meta">{meta || (place.in_database ? "" : vm.openData)}</div>
        {!place.in_database ? <div className="vmap-popup-note">{vm.openData} · {hm.noBooking}</div> : null}
        {free !== null ? (
          <div className={`vmap-popup-free${free > 0 ? "" : " is-none"}`}>
            <span>{hm.freeNow}</span>
            <b aria-label={`${free} ${freeTablesLabel(locale, free)}`}>{free}</b>
          </div>
        ) : place.in_database ? (
          <div className="vmap-popup-note">{vm.notBookableBadge}</div>
        ) : null}
        <div className="vmap-actions">
          <ActionLink action={actions.primary} variant="primary" />
          {actions.secondary ? <ActionLink action={actions.secondary} variant="secondary" /> : null}
        </div>
      </div>
    </div>
  );
}

/** Centred card over the map canvas: "Скоро в городе", nothing matches, load error. */
export function MapStateCard({ badge, title, body, children, tone = "default" }: { badge: string; title: string; body: string; children?: ReactNode; tone?: "default" | "soon" }) {
  return (
    <div className="vmap-state" role="status">
      <div className={`vmap-state-card${tone === "soon" ? " is-soon" : ""}`}>
        <span className="vmap-state-badge">{badge}</span>
        <h3>{title}</h3>
        <p>{body}</p>
        {children ? <div className="vmap-state-actions">{children}</div> : null}
      </div>
    </div>
  );
}

/** Phone bottom sheet (M4) with three snap points: map (peek) · preview (half) · list (full). */
export function MapSheet({
  locale, snap, heights, count, onSnap, children,
}: {
  locale: LocaleCode;
  snap: SheetSnap;
  heights: Record<SheetSnap, number>;
  count: number;
  onSnap: (snap: SheetSnap) => void;
  children?: ReactNode;
}) {
  const { hm } = mapCopy(locale);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; height: number; time: number; moved: boolean } | null>(null);
  const height = drag ?? heights[snap];
  const order: SheetSnap[] = ["peek", "half", "full"];
  const labels: Record<SheetSnap, string> = { peek: hm.snapMap, half: hm.snapPreview, full: hm.snapList };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    start.current = { y: event.clientY, height: heights[snap], time: event.timeStamp, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const dy = s.y - event.clientY;
    if (Math.abs(dy) > 4) s.moved = true;
    if (s.moved) setDrag(Math.min(heights.full, Math.max(heights.peek - 40, s.height + dy)));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved) {
      onSnap(order[(order.indexOf(snap) + 1) % order.length]);
      setDrag(null);
      return;
    }
    const dy = s.y - event.clientY;
    const velocity = dy / Math.max(event.timeStamp - s.time, 1);
    onSnap(nearestSnap(s.height + dy, heights, velocity, snap));
    setDrag(null);
  };

  return (
    <section
      className={`vmap-sheet${drag !== null ? " is-dragging" : ""}`}
      data-snap={snap}
      style={{ height }}
      aria-label={hm.sheetAria}
    >
      <div
        className="vmap-sheet-grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { start.current = null; setDrag(null); }}
      >
        <span className="vmap-sheet-handle" aria-hidden="true" />
        <div className="vmap-sheet-head">
          <strong>{count} {pluralForm(hm.places, locale, count)}</strong>
          <div className="seg vmap-sheet-seg" role="group" aria-label={hm.snapAria}>
            {order.map((item) => (
              <button key={item} type="button" className="seg-item" aria-pressed={snap === item} onClick={() => onSnap(item)}>
                {labels[item]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="vmap-sheet-body">{children}</div>
    </section>
  );
}
