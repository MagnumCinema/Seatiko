"use client";

import { useId, useMemo, useState } from "react";
import type { Table } from "@/lib/api";
import { listZonesFromTables, normalizeZone, zoneLabel } from "@/lib/floor-zones";

const STATUS_LABEL: Record<Table["status"], string> = {
  FREE: "Свободен",
  RESERVED: "Забронирован",
  OCCUPIED: "Занят",
  CLEANING: "Уборка",
};

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

export function TableFloorPlan({
  tables,
  selectedId,
  compact = false,
  onTableClick,
  bookHref,
}: {
  tables: Table[];
  selectedId?: string;
  compact?: boolean;
  onTableClick?: (table: Table) => void;
  bookHref?: string;
}) {
  const tipId = useId();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<string | null>(selectedId ?? null);
  const zones = useMemo(() => listZonesFromTables(tables), [tables]);
  const [activeZone, setActiveZone] = useState(zones[0] || "hall");

  if (!zones.includes(activeZone)) {
    setActiveZone(zones[0] || "hall");
  }

  const visible = useMemo(
    () => tables.filter((t) => normalizeZone(t.zone) === activeZone),
    [tables, activeZone],
  );

  const activeId = selectedId ?? localSelected;
  const active = tables.find((t) => t.id === activeId) ?? null;
  const hovered = tables.find((t) => t.id === hoverId) ?? null;
  const tipTable = hovered ?? (active && normalizeZone(active.zone) === activeZone ? active : null);

  function handleSelect(table: Table) {
    setLocalSelected(table.id);
    onTableClick?.(table);
  }

  return (
    <div className={`fa-floor schematic ${compact ? "compact" : ""}`}>
      {zones.length > 1 && (
        <div className="floor-zone-tabs guest" role="tablist" aria-label="Зоны заведения">
          {zones.map((zone) => {
            const free = tables.filter(
              (t) => normalizeZone(t.zone) === zone && t.status === "FREE",
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
                {zoneLabel(zone)}
                <small>{free} своб.</small>
              </button>
            );
          })}
        </div>
      )}

      <div
        className="fa-floor-room schematic"
        role="application"
        aria-label={`План · ${zoneLabel(activeZone)}`}
      >
        <div className="fa-floor-zone bar" aria-hidden>
          BAR
        </div>
        <div className="fa-floor-zone kitchen" aria-hidden>
          {activeZone === "street" || activeZone === "terrace" ? "Снаружи" : "Кухня"}
        </div>
        <div className="fa-floor-zone entrance" aria-hidden>
          Вход ↑
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
              aria-label={`Стол №${table.number}, ${table.seats} мест, ${STATUS_LABEL[table.status]}, ${zoneLabel(table.zone)}`}
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
          <div className="fa-floor-empty">В зоне «{zoneLabel(activeZone)}» пока нет столов</div>
        )}

        {tipTable && (
          <div id={tipId} className="fa-floor-tip schematic" role="status">
            <div className="fa-floor-tip-top">
              <strong>Стол №{tipTable.number}</strong>
              <span className={`fa-floor-tip-status ${tableStatusClass(tipTable.status)}`}>
                {STATUS_LABEL[tipTable.status]}
              </span>
            </div>
            <p>
              {zoneLabel(tipTable.zone)} · {tipTable.seats} мест
              {tipTable.status === "FREE" ? " · можно забронировать" : ""}
            </p>
          </div>
        )}
      </div>

      {active && (
        <div className="fa-floor-sheet schematic">
          <div>
            <p className="fa-floor-sheet-kicker">
              Выбранный стол · {zoneLabel(active.zone)}
            </p>
            <strong>№{active.number}</strong>
            <span className={`fa-floor-tip-status ${tableStatusClass(active.status)}`}>
              {STATUS_LABEL[active.status]}
            </span>
            <small>{active.seats} мест за столом</small>
          </div>
          {bookHref && active.status === "FREE" ? (
            <a className="fa-floor-sheet-cta" href={bookHref}>
              Забронировать
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
