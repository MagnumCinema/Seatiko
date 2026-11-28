"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Table } from "@/lib/api";
import { useLocale, type MessageKey } from "@/components/locale-provider";
import { HallFixtures, HallFrame, rotClass, useElementWidth } from "@/components/hall-plan";
import { HALL_H, HALL_W, clamp, fixturesOf } from "@/lib/floor-layout";
import { useFloorLayout } from "@/lib/floor-layout-store";
import {
  listZonesFromTables,
  normalizeZone,
  zoneLabel as fallbackZoneLabel,
} from "@/lib/floor-zones";
import { firstInZone } from "@/lib/floor-picks";
import { ScrollerFade } from "@/components/ui/scroller-fade";

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
 * Guests see the owner's plan as drawn: the same 16:10 hall, scaled to the stage width
 * ("100%"); zooming in scales it up and the stage pans (scroll / drag).
 * Below GUEST_MIN_SCALE the hall scrolls sideways instead of shrinking further.
 */
const GUEST_MIN_SCALE = 0.4;
const GUEST_MAX_SCALE = 1.1;
const COMPACT_MAX_SCALE = 0.8;
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2] as const;
const SEAT_FILTERS = [0, 2, 4, 6] as const;

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

function SeatIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="3.6" r="2.2" />
      <path d="M1.8 11c.3-2.5 2-3.9 4.2-3.9s3.9 1.4 4.2 3.9" />
    </svg>
  );
}

/**
 * The hall for guests: zone tabs, a seats filter and the legend above; − / 100% / + zoom
 * and a one-line hint on the plan; tables show their number and seats. With `inspector`
 * the selected table's panel sits beside the hall (under it on phones), never over it.
 */
export function TableFloorPlan({
  tables,
  selectedId,
  selectedIds,
  compact = false,
  onTableClick,
  mineReservationIds,
  inspector,
  legend,
}: {
  tables: Table[];
  selectedId?: string;
  selectedIds?: string[];
  compact?: boolean;
  onTableClick?: (table: Table) => void;
  /** Reservations of the signed-in guest: their tables show "Reserved by you". */
  mineReservationIds?: ReadonlySet<string>;
  /** Panel of the selected table (side by side on desktop, below on phones). */
  inspector?: ReactNode;
  /** Status legend, shown at the end of the toolbar. */
  legend?: ReactNode;
}) {
  const { t, locale } = useLocale();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<string | null>(selectedId ?? null);
  const zones = useMemo(() => listZonesFromTables(tables), [tables]);
  const [activeZone, setActiveZone] = useState(zones[0] || "hall");
  const [minSeats, setMinSeats] = useState<number>(0);
  const [zoomIndex, setZoomIndex] = useState(1);
  const layout = useFloorLayout(tables[0]?.venue_id);
  const rotated = useMemo(() => new Set(layout.rotated), [layout.rotated]);
  const fixtures = fixturesOf(layout.zones, activeZone);
  const [measureStage, stageWidth] = useElementWidth<HTMLDivElement>();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const setStage = useCallback(
    (node: HTMLDivElement | null) => {
      stageRef.current = node;
      return measureStage(node);
    },
    [measureStage],
  );
  const drag = useRef<{ x: number; y: number; left: number; top: number; id: number } | null>(null);
  const zoom = ZOOM_STEPS[zoomIndex];
  const fitScale = clamp(
    stageWidth > 0 ? stageWidth / HALL_W : 1,
    GUEST_MIN_SCALE,
    compact ? COMPACT_MAX_SCALE : GUEST_MAX_SCALE,
  );
  const scale = fitScale * zoom;
  const maxSeats = Math.max(0, ...tables.map((table) => table.seats));
  const seatFilters = SEAT_FILTERS.filter((n) => n === 0 || n <= maxSeats);

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

  function handleSelect(table: Table) {
    setLocalSelected(table.id);
    onTableClick?.(table);
  }

  /** After a zone switch or a seats filter the selection follows to a table that is shown. */
  function reselect(zone: string, seats: number) {
    if (active && normalizeZone(active.zone) === zone && active.seats >= seats) return;
    const next = firstInZone(tables, zone, seats);
    if (next) handleSelect(next);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const el = stageRef.current;
    if (!el || event.pointerType !== "mouse" || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
    drag.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, id: event.pointerId };
    el.setPointerCapture(event.pointerId);
    el.classList.add("is-panning");
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const el = stageRef.current;
    const start = drag.current;
    if (!el || !start || start.id !== event.pointerId) return;
    el.scrollLeft = start.left - (event.clientX - start.x);
    el.scrollTop = start.top - (event.clientY - start.y);
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const el = stageRef.current;
    if (!el || drag.current?.id !== event.pointerId) return;
    drag.current = null;
    el.releasePointerCapture(event.pointerId);
    el.classList.remove("is-panning");
  }

  const matching = visible.filter((table) => table.seats >= minSeats).length;
  const hint = hovered
    ? t("table.a11y_label", { n: hovered.number, status: statusLabel(hovered), seats: hovered.seats })
    : matching === 0 && minSeats > 0
      ? t("bench.no_match", { n: minSeats })
      : null;

  const hall = (
    <div className="bench-hall">
      <div className="bench-zoom" role="group" aria-label={t("bench.zoom_reset")}>
        <button
          type="button"
          className="bench-zoom-btn"
          aria-label={t("bench.zoom_out")}
          disabled={zoomIndex === 0}
          onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
        >
          −
        </button>
        <button
          type="button"
          className="bench-zoom-btn is-value"
          title={t("bench.zoom_reset")}
          aria-label={`${t("bench.zoom_reset")} · ${Math.round(zoom * 100)}%`}
          onClick={() => setZoomIndex(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="bench-zoom-btn"
          aria-label={t("bench.zoom_in")}
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
          onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
        >
          +
        </button>
      </div>
      <div
        ref={setStage}
        className={`hall-stage guest bench-stage${zoom > 1 ? " is-zoomed" : ""} ${compact ? "compact" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <HallFrame
          scale={scale}
          className="guest"
          role="group"
          aria-label={t("floor.plan", { zone: zLabel(activeZone) })}
          overlay={
            visible.length === 0 ? (
              <div className="fa-floor-empty">{t("floor.empty", { zone: zLabel(activeZone) })}</div>
            ) : null
          }
        >
          <HallFixtures
            fixtures={fixtures}
            labels={{ bar: t("floor.bar"), kitchen: t("floor.kitchen"), entrance: t("floor.entrance") }}
          />

          {visible.map((table, index) => {
            const isSelected = activeId === table.id || !!selectedIds?.includes(table.id);
            const dimmed = table.seats < minSeats;
            const className = [
              "fa-table",
              "schematic",
              statusClass(table),
              seatingClass(table.seats),
              rotClass(rotated.has(table.number) ? 90 : 0),
              isSelected ? "selected" : "",
              table.status === "FREE" ? "available" : "",
              dimmed ? "is-dimmed" : "",
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
                <small className="fa-table-seats" aria-hidden>
                  <SeatIcon />
                  {table.seats}
                </small>
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
      <p className="bench-hint" aria-live="polite">
        {hint ?? (
          <>
            <span className="is-wide">{t("bench.hint")}</span>
            <span className="is-narrow">{t("bench.hint_phone")}</span>
          </>
        )}
      </p>
    </div>
  );

  return (
    <div className={`fa-floor schematic bench ${compact ? "compact" : ""}${inspector ? " has-inspector" : ""}`}>
      <div className="bench-toolbar">
        {zones.length > 1 ? (
          <ScrollerFade
            className="bench-zones"
            trackClassName="seg floor-zone-tabs guest"
            role="tablist"
            ariaLabel={t("floor.zones")}
            activeKey={activeZone}
          >
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
                  className={`seg-item${activeZone === zone ? " is-active" : ""}`}
                  onClick={() => {
                    setActiveZone(zone);
                    reselect(zone, minSeats);
                  }}
                >
                  {zLabel(zone)}
                  <small>{t("floor.free_short", { count: free })}</small>
                </button>
              );
            })}
          </ScrollerFade>
        ) : null}
        {seatFilters.length > 2 ? (
          <ScrollerFade className="bench-seats" role="group" ariaLabel={t("bench.filter_label")}>
            {seatFilters.map((n) => (
              <button
                key={n}
                type="button"
                className={`chip${minSeats === n ? " is-active" : ""}`}
                aria-pressed={minSeats === n}
                onClick={() => {
                  setMinSeats(n);
                  reselect(activeZone, n);
                }}
              >
                {n === 0 ? t("bench.filter_all") : `${n}+`}
              </button>
            ))}
          </ScrollerFade>
        ) : null}
        {legend}
      </div>

      {inspector ? (
        <div className="bench-split">
          {hall}
          {inspector}
        </div>
      ) : (
        hall
      )}
    </div>
  );
}
