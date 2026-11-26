"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Table } from "@/lib/api";
import { useLocale, type MessageKey } from "@/components/locale-provider";
import { HallFixtures, HallFrame, rotClass, useElementWidth } from "@/components/hall-plan";
import { HALL_H, HALL_W, clamp, fixturesOf, tableSize } from "@/lib/floor-layout";
import { useFloorLayout } from "@/lib/floor-layout-store";
import {
  listZonesFromTables,
  normalizeZone,
  zoneLabel as fallbackZoneLabel,
} from "@/lib/floor-zones";
import { seatingRules } from "@/lib/seating-rules";

export function tableStatusClass(status: Table["status"] | string | undefined) {
  switch (status) {
    case "FREE":
      return "free";
    case "RESERVED":
      return "reserved";
    case "OCCUPIED":
      return "occupied";
    case "CLEANING":
      return "cleaning";
    default:
      return "free";
  }
}

/** A RESERVED table whose booking belongs to the signed-in guest. */
export function isMyTable(table: Table, mineReservationIds?: ReadonlySet<string>) {
  return (
    table.status === "RESERVED" &&
    !!table.reservation_id &&
    !!mineReservationIds?.has(table.reservation_id)
  );
}

/** Chair / booth layout matching schematic floor plans. */
export function seatingClass(seats: number) {
  if (seats <= 2) return "oval";
  if (seats >= 7) return "booth large";
  if (seats >= 5) return "portrait large";
  return "portrait";
}

export function SeatingMarks({ seats }: { seats: number }) {
  if (seats <= 2) {
    return (
      <>
        <i className="chair left" aria-hidden />
        <i className="chair right" aria-hidden />
      </>
    );
  }
  if (seats >= 7) {
    return (
      <>
        <i className="bench left" aria-hidden />
        <i className="bench right" aria-hidden />
      </>
    );
  }
  const perSide = seats >= 5 ? 3 : 2;
  return (
    <>
      {Array.from({ length: perSide }, (_, i) => (
        <i key={`l${i}`} className={`chair left n${i + 1}`} aria-hidden />
      ))}
      {Array.from({ length: perSide }, (_, i) => (
        <i key={`r${i}`} className={`chair right n${i + 1}`} aria-hidden />
      ))}
    </>
  );
}

/**
 * Guests see the owner's plan as drawn: the same 16:10 hall, scaled to the page width so the
 * whole hall (bar, kitchen, entrance) is in view on a phone. Below GUEST_MIN_SCALE (screens
 * under ~340px) the hall scrolls sideways instead of shrinking further.
 */
const GUEST_MIN_SCALE = 0.4;
const GUEST_MAX_SCALE = 1.1;
const COMPACT_MAX_SCALE = 0.8;

/** Table centre on the plan, in % of the hall (the API already keeps it off the walls). */
function tablePosition(table: Pick<Table, "x" | "y">) {
  return { left: table.x * 100, top: table.y * 100 };
}

/** The popover sits above its table, or below when the table is near the top wall. */
function tipPlacement(table: Pick<Table, "x" | "y">) {
  const { left, top } = tablePosition(table);
  const vertical = top < 38 ? "below" : "above";
  const horizontal = left < 24 ? "align-start" : left > 76 ? "align-end" : "align-center";
  return `${vertical} ${horizontal}`;
}

/** Same estimate as the public schedule: a visit lasts ~90 min, at least 15 min from now. */
const VISIT_MINUTES = 90;
function estimatedFreeAt(table: Pick<Table, "occupied_since">): string {
  const soonest = Date.now() + 15 * 60_000;
  const since = table.occupied_since ? new Date(table.occupied_since).getTime() : NaN;
  const end = Number.isNaN(since) ? soonest : Math.max(soonest, since + VISIT_MINUTES * 60_000);
  return new Date(end).toISOString();
}

/** Popover anchor; `--tip-gap` clears the table (and the booking time under a reserved one) at the current scale. */
function tipPosition(
  table: Pick<Table, "x" | "y" | "seats" | "status" | "reserved_for">,
  rotated: boolean,
  scale: number,
): CSSProperties {
  const { left, top } = tablePosition(table);
  const half = tableSize(table.seats, rotated ? 90 : 0).h / 2;
  const below = tipPlacement(table).startsWith("below");
  const timeBadge = below && table.status === "RESERVED" && table.reserved_for ? 24 : 0;
  return { left: `${left}%`, top: `${top}%`, ["--tip-gap" as string]: `${Math.round(half * scale + 12 + timeBadge)}px` };
}

const ZONE_KEYS: Record<string, MessageKey> = {
  hall: "floor.zone.hall",
  terrace: "floor.zone.terrace",
  street: "floor.zone.street",
  garden: "floor.zone.garden",
  bar: "floor.zone.bar",
};

const STATUS_KEYS: Record<Table["status"], MessageKey> = {
  FREE: "table.status_free",
  RESERVED: "table.status_reserved",
  OCCUPIED: "table.status_occupied",
  CLEANING: "floor.leg_clean",
};

export function TableFloorPlan({
  tables,
  selectedId,
  selectedIds,
  compact = false,
  onTableClick,
  bookHref,
  onReserve,
  onNotifyFree,
  onImComing,
  notifySetIds,
  comingArrivalById,
  comingSetIds,
  sheetMessage,
  hideSheet = false,
  mineReservationIds,
}: {
  tables: Table[];
  selectedId?: string;
  selectedIds?: string[];
  compact?: boolean;
  onTableClick?: (table: Table) => void;
  bookHref?: string;
  onReserve?: (table: Table) => void;
  onNotifyFree?: (table: Table) => void;
  onImComing?: (table: Table) => void;
  notifySetIds?: Set<string>;
  comingArrivalById?: Record<string, string>;
  comingSetIds?: Set<string>;
  sheetMessage?: string | null;
  /** When true, reservation actions are rendered outside (see TableReserveSheet). */
  hideSheet?: boolean;
  /** Reservations of the signed-in guest: their tables show "Reserved by you". */
  mineReservationIds?: ReadonlySet<string>;
}) {
  const { t, locale } = useLocale();
  const tipId = useId();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<string | null>(selectedId ?? null);
  const zones = useMemo(() => listZonesFromTables(tables), [tables]);
  const [activeZone, setActiveZone] = useState(zones[0] || "hall");
  const layout = useFloorLayout(tables[0]?.venue_id);
  const rotated = useMemo(() => new Set(layout.rotated), [layout.rotated]);
  const fixtures = fixturesOf(layout.zones, activeZone);
  const [stageRef, stageWidth] = useElementWidth<HTMLDivElement>();
  const scale = clamp(
    stageWidth > 0 ? stageWidth / HALL_W : 1,
    GUEST_MIN_SCALE,
    compact ? COMPACT_MAX_SCALE : GUEST_MAX_SCALE,
  );

  if (!zones.includes(activeZone)) {
    setActiveZone(zones[0] || "hall");
  }

  const visible = useMemo(
    () => tables.filter((table) => normalizeZone(table.zone) === activeZone),
    [tables, activeZone],
  );

  function zLabel(zone?: string | null) {
    const id = normalizeZone(zone);
    const key = ZONE_KEYS[id];
    return key ? t(key) : fallbackZoneLabel(zone, locale);
  }

  const isMine = (table: Table) => isMyTable(table, mineReservationIds);
  function statusLabel(table: Table) {
    return t(isMine(table) ? "table.status_reserved_mine" : STATUS_KEYS[table.status]);
  }
  function statusClass(table: Table) {
    return isMine(table) ? "reserved mine" : tableStatusClass(table.status);
  }

  function formatClock(value?: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  const activeId = selectedId ?? localSelected;
  const active = tables.find((table) => table.id === activeId) ?? null;
  const hovered = tables.find((table) => table.id === hoverId) ?? null;
  const tipTable =
    hovered ?? (active && normalizeZone(active.zone) === activeZone ? active : null);

  function handleSelect(table: Table) {
    setLocalSelected(table.id);
    onTableClick?.(table);
  }

  const notifyDone = active ? notifySetIds?.has(active.id) : false;
  const comingArrivalIso = active
    ? comingArrivalById?.[active.id]
    : undefined;
  const comingDone = Boolean(
    comingArrivalIso || (active && comingSetIds?.has(active.id)),
  );
  const comingTimeLabel = comingArrivalIso
    ? new Date(comingArrivalIso).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : active
      ? formatClock(active.reserved_for)
      : "—";

  return (
    <div className={`fa-floor schematic ${compact ? "compact" : ""}`}>
      {zones.length > 1 && (
        <div className="floor-zone-tabs guest" role="tablist" aria-label={t("floor.zones")}>
          {zones.map((zone) => {
            const free = tables.filter(
              (table) => normalizeZone(table.zone) === zone && table.status === "FREE",
            ).length;
            return (
              <button
                key={zone}
                type="button"
                role="tab"
                aria-selected={activeZone === zone}
                className={activeZone === zone ? "on" : ""}
                onClick={() => setActiveZone(zone)}
              >
                {zLabel(zone)}
                <small>{t("floor.free_short", { count: free })}</small>
              </button>
            );
          })}
        </div>
      )}

      <div className="fa-floor-room-scroll">
        <div ref={stageRef} className={`hall-stage guest ${compact ? "compact" : ""}`}>
          <HallFrame
            scale={scale}
            className="guest"
            role="group"
            aria-label={t("floor.plan", { zone: zLabel(activeZone) })}
            overlay={
              <>
                {visible.length === 0 && (
                  <div className="fa-floor-empty">{t("floor.empty", { zone: zLabel(activeZone) })}</div>
                )}
                {tipTable && (
                  <div
                    id={tipId}
                    className={`fa-floor-tip schematic anchored ${tipPlacement(tipTable)}`}
                    style={tipPosition(tipTable, rotated.has(tipTable.number), scale)}
                    role="status"
                  >
                    <div className="fa-floor-tip-top">
                      <strong>{t("table.title", { n: tipTable.number })}</strong>
                      <span className={`fa-floor-tip-status ${statusClass(tipTable)}`}>
                        {statusLabel(tipTable)}
                      </span>
                    </div>
                    <p>
                      {zLabel(tipTable.zone)} · {t("table.seats", { n: tipTable.seats })}
                      {tipTable.status === "FREE" ? t("floor.bookable") : ""}
                      {tipTable.status === "OCCUPIED"
                        ? ` · ${t("table.arrived_at", { time: formatClock(tipTable.occupied_since) })}`
                        : ""}
                      {tipTable.status === "RESERVED"
                        ? ` · ${t("table.reserved_for", { time: formatClock(tipTable.reserved_for) })}`
                        : ""}
                    </p>
                  </div>
                )}
              </>
            }
          >
            <HallFixtures
              fixtures={fixtures}
              labels={{ bar: t("floor.bar"), kitchen: t("floor.kitchen"), entrance: t("floor.entrance") }}
            />

            {visible.map((table, index) => {
              const isSelected = activeId === table.id || !!selectedIds?.includes(table.id);
              const className = [
                "fa-table",
                "schematic",
                statusClass(table),
                seatingClass(table.seats),
                rotClass(rotated.has(table.number) ? 90 : 0),
                isSelected ? "selected" : "",
                table.status === "FREE" ? "available" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={table.id}
                  type="button"
                  className={className}
                  style={{
                    left: table.x * HALL_W,
                    top: table.y * HALL_H,
                    animationDelay: `${index * 40}ms`,
                  }}
                  aria-pressed={isSelected}
                  aria-describedby={tipTable?.id === table.id ? tipId : undefined}
                  aria-label={t("table.a11y_label", {
                    n: table.number,
                    status: statusLabel(table),
                    seats: table.seats,
                  })}
                  onMouseEnter={() => setHoverId(table.id)}
                  onMouseLeave={() => setHoverId((id) => (id === table.id ? null : id))}
                  onFocus={() => setHoverId(table.id)}
                  onBlur={() => setHoverId((id) => (id === table.id ? null : id))}
                  onClick={() => handleSelect(table)}
                >
                  <SeatingMarks seats={table.seats} />
                  <span>{table.number}</span>
                  {table.status === "RESERVED" && table.reserved_for ? (
                    <small className="fa-table-time" aria-hidden>
                      {formatClock(table.reserved_for)}
                    </small>
                  ) : null}
                </button>
              );
            })}
          </HallFrame>
        </div>
      </div>

      {active && !hideSheet && (
        <TableReserveSheet
          table={active}
          bookHref={bookHref}
          onReserve={onReserve}
          onNotifyFree={onNotifyFree}
          onImComing={onImComing}
          notifyDone={notifyDone}
          comingDone={comingDone}
          comingTimeLabel={comingTimeLabel}
          sheetMessage={sheetMessage}
          mine={isMine(active)}
        />
      )}
    </div>
  );
}

export function TableReserveSheet({
  table,
  bookHref,
  onReserve,
  onNotifyFree,
  onImComing,
  notifyDone = false,
  comingDone = false,
  comingTimeLabel,
  sheetMessage,
  className = "",
  comingAccess = "allowed",
  onComingSignIn,
  sessionStartBeforeMin = 60,
  releaseBeforeMin = 15,
  mine = false,
}: {
  table: Table;
  bookHref?: string;
  onReserve?: (table: Table) => void;
  onNotifyFree?: (table: Table) => void;
  onImComing?: (table: Table) => void;
  notifyDone?: boolean;
  comingDone?: boolean;
  comingTimeLabel?: string;
  sheetMessage?: string | null;
  className?: string;
  /** "I'm coming" is only for the guest who owns the reservation (APP_LOGIC §5.3). */
  comingAccess?: "allowed" | "sign_in" | "hidden";
  onComingSignIn?: () => void;
  sessionStartBeforeMin?: number;
  releaseBeforeMin?: number;
  /** The reservation on this table is the signed-in guest's own. */
  mine?: boolean;
}) {
  const { t, locale } = useLocale();

  function zLabel(zone?: string | null) {
    const id = normalizeZone(zone);
    const key = ZONE_KEYS[id];
    return key ? t(key) : fallbackZoneLabel(zone, locale);
  }

  const isMine = mine && table.status === "RESERVED";
  const statusClass = isMine ? "reserved mine" : tableStatusClass(table.status);

  function formatClock(value?: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  function handleReserve() {
    if (onReserve) {
      onReserve(table);
      return;
    }
    if (bookHref) {
      window.location.assign(bookHref);
    }
  }

  const arrivalLabel =
    comingTimeLabel ?? formatClock(table.reserved_for);
  const rules = table.reserved_for
    ? seatingRules(new Date(table.reserved_for), sessionStartBeforeMin, releaseBeforeMin)
    : null;

  return (
    <div
      className={`fa-floor-sheet schematic is-${tableStatusClass(table.status)}${isMine ? " is-mine" : ""} ${className}`.trim()}
    >
      <div className="fa-floor-sheet-main">
        <p className="fa-floor-sheet-kicker">
          {t("floor.selected", { zone: zLabel(table.zone) })}
        </p>

        <div className="fa-floor-sheet-title">
          <strong>{t("table.title", { n: table.number })}</strong>
          <span className={`fa-floor-tip-status ${statusClass}`}>
            {isMine ? t("table.status_reserved_mine") : t(STATUS_KEYS[table.status])}
          </span>
        </div>

        <ul className="fa-floor-sheet-meta">
          <li>
            <span>{t("floor.sheet_zone")}</span>
            <b>{zLabel(table.zone)}</b>
          </li>
          <li>
            <span>{t("floor.sheet_seats")}</span>
            <b>{table.seats}</b>
          </li>
        </ul>

        {table.status === "FREE" && (
          <div className="fa-floor-sheet-facts">
            <p className="fa-floor-sheet-lead">{t("floor.sheet_free_lead")}</p>
            <p>{t("floor.sheet_free_body")}</p>
          </div>
        )}

        {table.status === "OCCUPIED" && (
          <div className="fa-floor-sheet-facts">
            <p className="fa-floor-sheet-lead">
              {t("table.arrived_at", { time: formatClock(table.occupied_since) })}
            </p>
            <p>{t("table.arrived_hint")}</p>
            <p>{t("floor.sheet_occupied_body")}</p>
            <p className="fa-floor-sheet-eta">
              {t("venue.day_cal_free_after", { time: formatClock(estimatedFreeAt(table)) })}
            </p>
          </div>
        )}

        {table.status === "RESERVED" && (
          <div className="fa-floor-sheet-facts">
            <p className="fa-floor-sheet-lead">
              {t(isMine ? "table.reserved_mine_for" : "table.reserved_for", {
                time: formatClock(table.reserved_for),
              })}
            </p>
            {rules ? (
              <ul>
                {isMine ? null : (
                  <li>
                    {t("table.rule_walkin_until", {
                      time: formatClock(rules.walkInUntil.toISOString()),
                    })}
                  </li>
                )}
                <li>
                  {t(
                    isMine
                      ? rules.ownerFromNeedsFreeTable
                        ? "table.rule_mine_from_if_free"
                        : "table.rule_mine_from"
                      : rules.ownerFromNeedsFreeTable
                        ? "table.rule_owner_from_if_free"
                        : "table.rule_owner_from",
                    { time: formatClock(rules.ownerFrom.toISOString()) },
                  )}
                </li>
              </ul>
            ) : null}
          </div>
        )}

        {table.status === "CLEANING" && (
          <div className="fa-floor-sheet-facts">
            <p className="fa-floor-sheet-lead">{t("floor.sheet_cleaning_lead")}</p>
            <p>{t("floor.sheet_cleaning_body")}</p>
          </div>
        )}

        {sheetMessage ? (
          <p className="fa-floor-sheet-msg">{sheetMessage}</p>
        ) : null}
      </div>

      <div className="fa-floor-sheet-actions">
        {table.status === "FREE" && (onReserve || bookHref) ? (
          onReserve ? (
            <button
              type="button"
              className="fa-floor-sheet-cta"
              onClick={handleReserve}
            >
              {t("table.book_this")}
            </button>
          ) : (
            <a className="fa-floor-sheet-cta" href={bookHref}>
              {t("table.book_this")}
            </a>
          )
        ) : null}
        {table.status === "OCCUPIED" && onNotifyFree ? (
          <button
            type="button"
            className="fa-floor-sheet-cta ghost"
            disabled={notifyDone}
            onClick={() => onNotifyFree(table)}
          >
            {notifyDone ? t("table.notify_set") : `🔔 ${t("table.notify_free")}`}
          </button>
        ) : null}
        {table.status === "RESERVED" && onImComing && comingAccess === "allowed" ? (
          <button
            type="button"
            className="fa-floor-sheet-cta ghost"
            disabled={comingDone}
            onClick={() => onImComing(table)}
          >
            {comingDone
              ? t("table.im_coming_set", { time: arrivalLabel })
              : `✓ ${t("table.im_coming")}`}
          </button>
        ) : null}
        {table.status === "RESERVED" && comingAccess === "sign_in" && onComingSignIn ? (
          <button type="button" className="fa-floor-sheet-cta ghost" onClick={onComingSignIn}>
            {t("table.im_coming_sign_in")}
          </button>
        ) : null}
        {isMine && table.reservation_id ? (
          <Link
            className="fa-floor-sheet-cta ghost mine"
            href={`/account?reservation=${encodeURIComponent(table.reservation_id)}`}
          >
            {t("table.open_my_booking")}
          </Link>
        ) : null}
        {table.status === "CLEANING" ? (
          <p className="fa-floor-sheet-actions-note">{t("floor.sheet_cleaning_wait")}</p>
        ) : null}
        {table.status !== "FREE" && onReserve && !isMine ? (
          <button type="button" className="fa-floor-sheet-cta ghost" onClick={handleReserve}>
            {t("table.book_later")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
