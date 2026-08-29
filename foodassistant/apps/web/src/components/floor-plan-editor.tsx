"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SeatingMarks, seatingClass, tableStatusClass } from "@/components/table-floor-plan";
import type { Table } from "@/lib/api";
import {
  FLOOR_ZONE_PRESETS,
  listZonesFromTables,
  normalizeZone,
  zoneLabel,
} from "@/lib/floor-zones";

export type FloorDraftTable = {
  key: string;
  number: number;
  seats: number;
  x: number;
  y: number;
  zone?: string;
  status?: Table["status"];
  locked?: boolean;
};

type Props = {
  tables: FloorDraftTable[];
  onChange: (tables: FloorDraftTable[]) => void;
  busy?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nextNumber(tables: FloorDraftTable[]) {
  const used = new Set(tables.map((t) => t.number));
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

export function FloorPlanEditor({ tables, onChange, busy }: Props) {
  const roomRef = useRef<HTMLDivElement | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [activeZone, setActiveZone] = useState("hall");
  const dragOffset = useRef({ x: 0, y: 0 });

  const zones = useMemo(() => {
    const fromTables = listZonesFromTables(tables);
    const always = ["hall", "terrace", "street"];
    return [...new Set([...always, ...fromTables])];
  }, [tables]);

  const visible = useMemo(
    () => tables.filter((t) => normalizeZone(t.zone) === activeZone),
    [tables, activeZone],
  );

  const selected = useMemo(
    () => tables.find((t) => t.key === selectedKey) ?? null,
    [tables, selectedKey],
  );

  useEffect(() => {
    if (!zones.includes(activeZone)) {
      setActiveZone(zones[0] || "hall");
    }
  }, [zones, activeZone]);

  useEffect(() => {
    if (selectedKey && !tables.some((t) => t.key === selectedKey)) {
      setSelectedKey(tables[0]?.key ?? null);
    }
  }, [tables, selectedKey]);

  const moveToPointer = useCallback(
    (key: string, clientX: number, clientY: number) => {
      const room = roomRef.current;
      if (!room) return;
      const rect = room.getBoundingClientRect();
      const x = clamp((clientX - rect.left) / rect.width - dragOffset.current.x, 0.1, 0.9);
      const y = clamp((clientY - rect.top) / rect.height - dragOffset.current.y, 0.14, 0.86);
      onChange(tables.map((t) => (t.key === key ? { ...t, x, y } : t)));
    },
    [onChange, tables],
  );

  useEffect(() => {
    if (!draggingKey) return;

    function onMove(event: PointerEvent) {
      moveToPointer(draggingKey!, event.clientX, event.clientY);
    }
    function onUp() {
      setDraggingKey(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingKey, moveToPointer]);

  function addTable(seats: number) {
    const key = `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const table: FloorDraftTable = {
      key,
      number: nextNumber(tables),
      seats,
      x: 0.5,
      y: 0.5,
      zone: activeZone,
      status: "FREE",
    };
    onChange([...tables, table]);
    setSelectedKey(key);
  }

  function removeSelected() {
    if (!selected || selected.locked) return;
    onChange(tables.filter((t) => t.key !== selected.key));
    setSelectedKey(null);
  }

  function updateSelected(patch: Partial<FloorDraftTable>) {
    if (!selected) return;
    if (patch.number != null) {
      const taken = tables.some((t) => t.key !== selected.key && t.number === patch.number);
      if (taken) return;
    }
    if (patch.zone != null) {
      patch.zone = normalizeZone(patch.zone);
      setActiveZone(patch.zone);
    }
    onChange(tables.map((t) => (t.key === selected.key ? { ...t, ...patch } : t)));
  }

  function applyTemplate(kind: "small" | "cafe" | "hall") {
    const templates: Record<typeof kind, FloorDraftTable[]> = {
      small: [
        { key: "t1", number: 11, seats: 4, x: 0.28, y: 0.28, zone: "hall", status: "FREE" },
        { key: "t2", number: 12, seats: 4, x: 0.48, y: 0.28, zone: "hall", status: "FREE" },
        { key: "t3", number: 14, seats: 4, x: 0.68, y: 0.28, zone: "hall", status: "FREE" },
        { key: "t4", number: 15, seats: 2, x: 0.48, y: 0.62, zone: "terrace", status: "FREE" },
      ],
      cafe: [
        { key: "t1", number: 11, seats: 4, x: 0.22, y: 0.24, zone: "hall", status: "FREE" },
        { key: "t2", number: 12, seats: 4, x: 0.4, y: 0.24, zone: "hall", status: "FREE" },
        { key: "t3", number: 13, seats: 4, x: 0.58, y: 0.24, zone: "hall", status: "FREE" },
        { key: "t4", number: 14, seats: 6, x: 0.78, y: 0.24, zone: "hall", status: "FREE" },
        { key: "t5", number: 15, seats: 2, x: 0.72, y: 0.52, zone: "terrace", status: "FREE" },
        { key: "t6", number: 16, seats: 4, x: 0.42, y: 0.52, zone: "terrace", status: "FREE" },
        { key: "t7", number: 19, seats: 4, x: 0.28, y: 0.72, zone: "street", status: "FREE" },
        { key: "t8", number: 20, seats: 4, x: 0.52, y: 0.72, zone: "street", status: "FREE" },
        { key: "t9", number: 21, seats: 6, x: 0.76, y: 0.72, zone: "street", status: "FREE" },
      ],
      hall: [
        { key: "t1", number: 11, seats: 4, x: 0.2, y: 0.22, zone: "hall", status: "FREE" },
        { key: "t2", number: 12, seats: 4, x: 0.38, y: 0.22, zone: "hall", status: "FREE" },
        { key: "t3", number: 13, seats: 4, x: 0.56, y: 0.22, zone: "hall", status: "FREE" },
        { key: "t4", number: 14, seats: 6, x: 0.76, y: 0.22, zone: "hall", status: "FREE" },
        { key: "t5", number: 15, seats: 2, x: 0.7, y: 0.48, zone: "terrace", status: "FREE" },
        { key: "t6", number: 16, seats: 4, x: 0.42, y: 0.48, zone: "terrace", status: "FREE" },
        { key: "t7", number: 19, seats: 4, x: 0.22, y: 0.72, zone: "street", status: "FREE" },
        { key: "t8", number: 20, seats: 4, x: 0.42, y: 0.72, zone: "street", status: "FREE" },
        { key: "t9", number: 21, seats: 6, x: 0.62, y: 0.72, zone: "street", status: "FREE" },
        { key: "t10", number: 22, seats: 8, x: 0.82, y: 0.72, zone: "street", status: "FREE" },
      ],
    };
    const next = templates[kind].map((t) => ({
      ...t,
      key: `draft-${t.number}-${Date.now()}`,
    }));
    onChange(next);
    setActiveZone("hall");
    setSelectedKey(next[0]?.key ?? null);
  }

  return (
    <div className={`floor-editor ${busy ? "busy" : ""}`}>
      <div className="floor-editor-toolbar">
        <div className="floor-zone-tabs" role="tablist" aria-label="Зоны">
          {zones.map((zone) => (
            <button
              key={zone}
              type="button"
              role="tab"
              aria-selected={activeZone === zone}
              className={activeZone === zone ? "on" : ""}
              onClick={() => setActiveZone(zone)}
            >
              {zoneLabel(zone)}
              <small>
                {tables.filter((t) => normalizeZone(t.zone) === zone).length}
              </small>
            </button>
          ))}
        </div>
        <div className="floor-editor-actions">
          <button type="button" className="fa-btn fa-btn-outline" disabled={busy} onClick={() => addTable(2)}>
            + 2 места
          </button>
          <button type="button" className="fa-btn fa-btn-outline" disabled={busy} onClick={() => addTable(4)}>
            + 4 места
          </button>
          <button type="button" className="fa-btn fa-btn-outline" disabled={busy} onClick={() => addTable(6)}>
            + 6 мест
          </button>
          <button type="button" className="fa-btn fa-btn-outline" disabled={busy} onClick={() => applyTemplate("small")}>
            Шаблон S
          </button>
          <button type="button" className="fa-btn fa-btn-outline" disabled={busy} onClick={() => applyTemplate("cafe")}>
            Кафе
          </button>
          <button type="button" className="fa-btn fa-btn-outline" disabled={busy} onClick={() => applyTemplate("hall")}>
            Зал+улица
          </button>
        </div>
      </div>

      <div className="floor-editor-stage">
        <div
          ref={roomRef}
          className="fa-floor-room schematic floor-editor-room"
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

          {visible.map((table) => (
            <button
              key={table.key}
              type="button"
              className={`fa-table schematic ${tableStatusClass(
                table.status,
              )} ${seatingClass(table.seats)} ${selectedKey === table.key ? "selected" : ""} ${
                draggingKey === table.key ? "dragging" : ""
              }`}
              style={{ left: `${table.x * 100}%`, top: `${table.y * 100}%` }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const room = roomRef.current;
                if (!room) return;
                const rect = room.getBoundingClientRect();
                dragOffset.current = {
                  x: (event.clientX - rect.left) / rect.width - table.x,
                  y: (event.clientY - rect.top) / rect.height - table.y,
                };
                setSelectedKey(table.key);
                setDraggingKey(table.key);
                (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
              }}
            >
              <SeatingMarks seats={table.seats} />
              <span>{table.number}</span>
            </button>
          ))}

          {visible.length === 0 && (
            <div className="fa-floor-empty">
              В зоне «{zoneLabel(activeZone)}» пока нет столов — добавьте или перенесите стол сюда
            </div>
          )}
        </div>

        <aside className="floor-editor-side">
          <h4>Настройки стола</h4>
          {!selected && <p className="fa-muted">Кликните стол на плане</p>}
          {selected && (
            <>
              <label>
                Номер
                <input
                  type="number"
                  min={1}
                  value={selected.number}
                  disabled={busy || selected.locked}
                  onChange={(e) => updateSelected({ number: Number(e.target.value) || 1 })}
                />
              </label>
              <label>
                Мест
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={selected.seats}
                  disabled={busy}
                  onChange={(e) =>
                    updateSelected({ seats: clamp(Number(e.target.value) || 2, 1, 20) })
                  }
                />
              </label>
              <label>
                Зона
                <select
                  value={normalizeZone(selected.zone)}
                  disabled={busy}
                  onChange={(e) => updateSelected({ zone: e.target.value })}
                >
                  {FLOOR_ZONE_PRESETS.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="floor-editor-xy">
                <span>X {(selected.x * 100).toFixed(0)}%</span>
                <span>Y {(selected.y * 100).toFixed(0)}%</span>
              </div>
              {selected.locked ? (
                <p className="fa-muted">Стол занят/в брони — позицию можно менять, удаление недоступно</p>
              ) : (
                <button type="button" className="floor-editor-danger" disabled={busy} onClick={removeSelected}>
                  Удалить стол
                </button>
              )}
            </>
          )}
          <p className="floor-editor-hint">
            Зоны (зал / улица / терраса) гости увидят вкладками на сайте и в приложении. Новый стол
            добавляется в текущую вкладку.
          </p>
        </aside>
      </div>
    </div>
  );
}

export function tablesToDraft(tables: Table[]): FloorDraftTable[] {
  return tables
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((table) => ({
      key: table.id,
      number: table.number,
      seats: table.seats,
      x: table.x,
      y: table.y,
      zone: normalizeZone(table.zone),
      status: table.status,
      locked: table.status === "OCCUPIED" || table.status === "RESERVED",
    }));
}
