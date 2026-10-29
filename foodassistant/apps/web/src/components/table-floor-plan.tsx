"use client";

import { useId, useMemo, useState } from "react";
import type { Table } from "@/lib/api";
import { useLocale, type MessageKey } from "@/components/locale-provider";
import {
  listZonesFromTables,
  normalizeZone,
  zoneLabel as fallbackZoneLabel,
} from "@/lib/floor-zones";

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
}: {
  tables: Table[];
  selectedId?: string;
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
}) {
  const { t, locale } = useLocale();
  const tipId = useId();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<string | null>(selectedId ?? null);
  const zones = useMemo(() => listZonesFromTables(tables), [tables]);
  const [activeZone, setActiveZone] = useState(zones[0] || "hall");

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
    return key ? t(key) : fallbackZoneLabel(zone);
  }

  function statusLabel(status: Table["status"]) {
    return t(STATUS_KEYS[status]);
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

      <div
        className="fa-floor-room schematic"
        role="application"
        aria-label={t("floor.plan", { zone: zLabel(activeZone) })}
      >
        <div className="fa-floor-zone bar" aria-hidden>
          {t("floor.bar")}
        </div>
        <div className="fa-floor-zone kitchen" aria-hidden>
          {activeZone === "street" || activeZone === "terrace"
            ? t("floor.outside")
            : t("floor.kitchen")}
        </div>
        <div className="fa-floor-zone entrance" aria-hidden>
          {t("floor.entrance")}
        </div>

        {visible.map((table, index) => {
          const left = Math.max(12, Math.min(88, table.x * 100));
          const top = Math.max(16, Math.min(84, table.y * 100));
          const isSelected = activeId === table.id;
          const className = [
            "fa-table",
            "schematic",
            tableStatusClass(table.status),
            seatingClass(table.seats),
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
                left: `${left}%`,
                top: `${top}%`,
                animationDelay: `${index * 40}ms`,
              }}
              aria-pressed={isSelected}
              aria-describedby={tipTable?.id === table.id ? tipId : undefined}
              aria-label={t("table.title", { n: table.number })}
              onMouseEnter={() => setHoverId(table.id)}
              onMouseLeave={() => setHoverId((id) => (id === table.id ? null : id))}
              onFocus={() => setHoverId(table.id)}
              onBlur={() => setHoverId((id) => (id === table.id ? null : id))}
              onClick={() => handleSelect(table)}
            >
              <SeatingMarks seats={table.seats} />
              <span>{table.number}</span>
            </button>
          );
        })}

        {visible.length === 0 && (
          <div className="fa-floor-empty">
            {t("floor.empty", { zone: zLabel(activeZone) })}
          </div>
        )}

        {tipTable && (
          <div id={tipId} className="fa-floor-tip schematic" role="status">
            <div className="fa-floor-tip-top">
              <strong>{t("table.title", { n: tipTable.number })}</strong>
              <span className={`fa-floor-tip-status ${tableStatusClass(tipTable.status)}`}>
                {statusLabel(tipTable.status)}
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
}) {
  const { t, locale } = useLocale();

  function zLabel(zone?: string | null) {
    const id = normalizeZone(zone);
    const key = ZONE_KEYS[id];
    return key ? t(key) : fallbackZoneLabel(zone);
  }

  function statusLabel(status: Table["status"]) {
    return t(STATUS_KEYS[status]);
  }

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

  return (
    <div className={`fa-floor-sheet schematic ${className}`.trim()}>
      <div className="fa-floor-sheet-main">
        <p className="fa-floor-sheet-kicker">
          {t("floor.selected", { zone: zLabel(table.zone) })}
        </p>

        <div className="fa-floor-sheet-title">
          <strong>{t("table.title", { n: table.number })}</strong>
          <span className={`fa-floor-tip-status ${tableStatusClass(table.status)}`}>
            {statusLabel(table.status)}
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
          <li>
            <span>{t("floor.sheet_status")}</span>
            <b>{statusLabel(table.status)}</b>
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
          </div>
        )}

        {table.status === "RESERVED" && (
          <div className="fa-floor-sheet-facts">
            <p className="fa-floor-sheet-lead">
              {t("table.reserved_for", { time: formatClock(table.reserved_for) })}
            </p>
            <ul>
              <li>
                {t("table.rule_session_start", {
                  time: formatClock(
                    table.reserved_for
                      ? new Date(
                          new Date(table.reserved_for).getTime() - 60 * 60_000,
                        ).toISOString()
                      : undefined,
                  ),
                })}
              </li>
              <li>
                {t("table.rule_release", {
                  time: formatClock(
                    table.reserved_for
                      ? new Date(
                          new Date(table.reserved_for).getTime() - 15 * 60_000,
                        ).toISOString()
                      : undefined,
                  ),
                })}
              </li>
            </ul>
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
        {table.status === "RESERVED" && onImComing ? (
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
        {table.status === "CLEANING" ? (
          <p className="fa-floor-sheet-actions-note">{t("floor.sheet_cleaning_wait")}</p>
        ) : null}
      </div>
    </div>
  );
}
