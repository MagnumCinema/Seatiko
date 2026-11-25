"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SeatingMarks, seatingClass, tableStatusClass } from "@/components/table-floor-plan";
import { useLocale } from "@/components/locale-provider";
import { SelectMenu } from "@/components/ui/select-menu";
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

const floorCopy = {
  ru: {
    zonesLabel: "Зоны",
    planPrefix: "План",
    bar: "Бар",
    outside: "Снаружи",
    kitchen: "Кухня",
    entrance: "Вход ↑",
    emptyZone: (zone: string) => `В зоне «${zone}» пока нет столов — добавьте или перенесите стол сюда`,
    settingsTitle: "Настройки стола",
    clickTable: "Кликните стол на плане",
    numberLabel: "Номер",
    seatsLabel: "Мест",
    zoneLabel: "Зона",
    lockedHint: "Стол занят/в брони — позицию можно менять, удаление недоступно",
    zonesHint: "Зоны (зал / улица / терраса) гости увидят вкладками на сайте и в приложении. Новый стол добавляется в текущую вкладку.",
  },
  en: {
    zonesLabel: "Zones",
    planPrefix: "Floor plan",
    bar: "Bar",
    outside: "Outside",
    kitchen: "Kitchen",
    entrance: "Entrance ↑",
    emptyZone: (zone: string) => `No tables in “${zone}” yet — add or move a table here`,
    settingsTitle: "Table settings",
    clickTable: "Click a table on the floor plan",
    numberLabel: "Number",
    seatsLabel: "Seats",
    zoneLabel: "Zone",
    lockedHint: "Table is occupied or reserved — position can be changed, deletion is disabled",
    zonesHint: "Guests will see zones (hall / street / terrace) as tabs on the website and in the app. New tables are added to the active tab.",
  },
  ro: {
    zonesLabel: "Zone",
    planPrefix: "Plan",
    bar: "Bar",
    outside: "Exterior",
    kitchen: "Bucătărie",
    entrance: "Intrare ↑",
    emptyZone: (zone: string) => `Nu există încă mese în zona „${zone}” — adaugă sau mută o masă aici`,
    settingsTitle: "Setările mesei",
    clickTable: "Fă clic pe o masă de pe plan",
    numberLabel: "Număr",
    seatsLabel: "Locuri",
    zoneLabel: "Zonă",
    lockedHint: "Masa este ocupată sau rezervată — poziția poate fi mutată, ștergerea este dezactivată",
    zonesHint: "Oaspeții vor vedea zonele (sală / stradă / terasă) ca file pe site și în aplicație. Mesele noi se adaugă în fila curentă.",
  },
} as const;

export function FloorPlanEditor({ tables, onChange, busy }: Props) {
  const { locale } = useLocale();
  const copy = floorCopy[locale];
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

  if (!zones.includes(activeZone)) {
    setActiveZone(zones[0] || "hall");
  }
  if (selectedKey && !tables.some((t) => t.key === selectedKey)) {
    setSelectedKey(tables[0]?.key ?? null);
  }

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
        <div className="floor-zone-tabs" role="tablist" aria-label={copy.zonesLabel}>
          {zones.map((zone) => (
            <button
              key={zone}
              type="button"
              role="tab"
              aria-selected={activeZone === zone}
              className={activeZone === zone ? "on" : ""}
              onClick={() => setActiveZone(zone)}
            >
              {zoneLabel(zone, locale)}
              <small>
                {tables.filter((t) => normalizeZone(t.zone) === zone).length}
              </small>
            </button>
          ))}
        </div>
        <div className="floor-editor-actions">
          <div className="floor-actions-group">
            <span className="floor-actions-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              {locale === "ro" ? "Adaugă masă:" : locale === "en" ? "Add table:" : "Добавить стол:"}
            </span>
            <div className="floor-actions-pills">
              <button
                type="button"
                className="floor-add-pill"
                disabled={busy}
                onClick={() => addTable(2)}
                title={locale === "ro" ? "Adaugă masă pentru 2 persoane" : locale === "en" ? "Add table for 2" : "Добавить двухместный стол"}
              >
                <span className="floor-pill-seats-icon" aria-hidden="true">2</span>
                <span>{locale === "ro" ? "+ 2 locuri" : locale === "en" ? "+ 2 seats" : "+ 2 места"}</span>
              </button>
              <button
                type="button"
                className="floor-add-pill"
                disabled={busy}
                onClick={() => addTable(4)}
                title={locale === "ro" ? "Adaugă masă pentru 4 persoane" : locale === "en" ? "Add table for 4" : "Добавить четырёхместный стол"}
              >
                <span className="floor-pill-seats-icon" aria-hidden="true">4</span>
                <span>{locale === "ro" ? "+ 4 locuri" : locale === "en" ? "+ 4 seats" : "+ 4 места"}</span>
              </button>
              <button
                type="button"
                className="floor-add-pill"
                disabled={busy}
                onClick={() => addTable(6)}
                title={locale === "ro" ? "Adaugă masă pentru 6 persoane" : locale === "en" ? "Add table for 6" : "Добавить шестиместный стол"}
              >
                <span className="floor-pill-seats-icon" aria-hidden="true">6</span>
                <span>{locale === "ro" ? "+ 6 locuri" : locale === "en" ? "+ 6 seats" : "+ 6 мест"}</span>
              </button>
            </div>
          </div>

          <div className="floor-actions-group templates">
            <span className="floor-actions-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              {locale === "ro" ? "Șabloane:" : locale === "en" ? "Presets:" : "Шаблоны:"}
            </span>
            <div className="floor-actions-pills">
              <button
                type="button"
                className="floor-template-pill"
                disabled={busy}
                onClick={() => applyTemplate("small")}
              >
                {locale === "ro" ? "Compact S" : locale === "en" ? "Compact S" : "Компактный S"}
              </button>
              <button
                type="button"
                className="floor-template-pill"
                disabled={busy}
                onClick={() => applyTemplate("cafe")}
              >
                {locale === "ro" ? "Cafenea" : locale === "en" ? "Cafe" : "Кафе"}
              </button>
              <button
                type="button"
                className="floor-template-pill"
                disabled={busy}
                onClick={() => applyTemplate("hall")}
              >
                {locale === "ro" ? "Sală + stradă" : locale === "en" ? "Hall + street" : "Зал + улица"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="floor-editor-stage">
        <div
          ref={roomRef}
          className="fa-floor-room schematic floor-editor-room"
          role="application"
          aria-label={`${copy.planPrefix} · ${zoneLabel(activeZone, locale)}`}
        >
          <div className="fa-floor-zone bar" aria-hidden>
            {copy.bar}
          </div>
          <div className="fa-floor-zone kitchen" aria-hidden>
            {activeZone === "street" || activeZone === "terrace" ? copy.outside : copy.kitchen}
          </div>
          <div className="fa-floor-zone entrance" aria-hidden>
            {copy.entrance}
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
              {copy.emptyZone(zoneLabel(activeZone, locale))}
            </div>
          )}
        </div>

        <aside className="floor-editor-side">
          <h4>{copy.settingsTitle}</h4>
          {!selected && <p className="fa-muted">{copy.clickTable}</p>}
          {selected && (
            <>
              <label>
                {copy.numberLabel}
                <input
                  type="number"
                  min={1}
                  value={selected.number}
                  disabled={busy || selected.locked}
                  onChange={(e) => updateSelected({ number: Number(e.target.value) || 1 })}
                />
              </label>
              <label>
                {copy.seatsLabel}
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
                {copy.zoneLabel}
                <SelectMenu
                  value={normalizeZone(selected.zone)}
                  disabled={busy}
                  onChange={(value) => updateSelected({ zone: value })}
                  options={FLOOR_ZONE_PRESETS.map((z) => ({
                    value: z.id,
                    label: zoneLabel(z.id, locale),
                  }))}
                />
              </label>
              <div className="floor-editor-xy">
                <span>X {(selected.x * 100).toFixed(0)}%</span>
                <span>Y {(selected.y * 100).toFixed(0)}%</span>
              </div>
              {selected.locked ? (
                <p className="fa-muted">{copy.lockedHint}</p>
              ) : (
                <button
                  type="button"
                  className="panel-btn ghost sm danger floor-editor-danger"
                  disabled={busy}
                  onClick={removeSelected}
                >
                  {locale === "ro" ? "Elimină masa" : locale === "en" ? "Delete table" : "Удалить стол"}
                </button>
              )}
            </>
          )}
          <p className="floor-editor-hint">
            {copy.zonesHint}
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
