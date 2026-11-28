"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SeatingMarks, seatingClass, tableStatusClass } from "@/components/table-floor-plan";
import { EntranceMark, FixtureBox, HallFrame, rectStyle, rotClass, useElementWidth } from "@/components/hall-plan";
import { CabinetConfirmDialog } from "@/components/cabinet-confirm-dialog";
import { useLocale } from "@/components/locale-provider";
import { SelectMenu } from "@/components/ui/select-menu";
import { pluralize } from "@/lib/cabinet-helpers";
import {
  GRID,
  HALL_H,
  HALL_W,
  PUSH_RADIUS,
  boxFits,
  checkTableNumber,
  clamp,
  defaultBox,
  entranceFits,
  findConflicts,
  findFreeBox,
  findFreeSpot,
  fixturesOf,
  nextTableNumber,
  obstaclesExcept,
  planItems,
  rectAround,
  resizeBox,
  resolveTableDrop,
  snapBox,
  snapEntrance,
  snapTableCenter,
  tableFits,
  tableId,
  tableSize,
  type BoxKind,
  type DraftTable,
  type Entrance,
  type FloorPlanState,
  type ItemId,
  type Point,
  type Rect,
  type Rot,
  type Size,
  type ZoneFixtures,
} from "@/lib/floor-layout";
import { applyFloorTemplate, type FloorTemplateId } from "@/lib/floor-templates";
import { FLOOR_ZONE_PRESETS, listZonesFromTables, zoneLabel } from "@/lib/floor-zones";
import { getSiteCopy } from "@/lib/site-copy";

type Props = {
  value: FloorPlanState;
  onChange: (next: FloorPlanState) => void;
  busy?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

type FloorCopy = ReturnType<typeof getSiteCopy>["cabinet"]["floorEditor"];

/** Screen pixels a pointer must travel before a press becomes a drag (a shorter press only selects). */
const DRAG_THRESHOLD = 4;
/** Largest zoom, as on-screen pixels per hall unit. */
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.25;
const SEAT_PRESETS = [2, 4, 6, 8] as const;
const SEATS_MIN = 1;
const SEATS_MAX = 20;
const TEMPLATES: FloorTemplateId[] = ["small", "cafe", "hall"];

type DragBase = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** Other items of the zone, fixed for the whole drag. */
  obstacles: Rect[];
};
type Drag =
  | (DragBase & {
      kind: "table";
      key: string;
      size: Size;
      offset: Point;
      at: Point;
      blocked: boolean;
      landing: Point | null;
    })
  | (DragBase & { kind: "box"; id: BoxKind; offset: Point; rect: Rect; blocked: boolean })
  | (DragBase & { kind: "resize"; id: BoxKind; origin: Rect; rect: Rect; blocked: boolean })
  | (DragBase & { kind: "entrance"; entrance: Entrance; blocked: boolean });

type Pan = { pointerId: number; x: number; y: number; left: number; top: number; moved: boolean };

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function newTableKey() {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isTextField(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/** Where a table of `size` can stand near its current centre: in place when free, else the nearest free spot. */
function placeNear(center: Point, size: Size, obstacles: Rect[], maxPush = PUSH_RADIUS): Point | null {
  if (tableFits(center, size, obstacles)) return center;
  return resolveTableDrop(center, size, obstacles, maxPush)?.at ?? null;
}

export function FloorPlanEditor({ value, onChange, busy = false, canUndo, canRedo, onUndo, onRedo }: Props) {
  const { locale } = useLocale();
  const copy = getSiteCopy(locale).cabinet.floorEditor;
  const hintId = useId();
  const [activeZone, setActiveZone] = useState("hall");
  const [selectedId, setSelectedId] = useState<ItemId | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const panRef = useRef<Pan | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState<{ text: string; at: number } | null>(null);
  const [askTemplate, setAskTemplate] = useState<FloorTemplateId | null>(null);
  const viewportEl = useRef<HTMLDivElement | null>(null);
  const canvasEl = useRef<HTMLDivElement | null>(null);
  const pendingFocal = useRef<{ hall: Point; view: Point } | null>(null);
  const revealKey = useRef<string | null>(null);
  const [measureViewport, viewportWidth] = useElementWidth<HTMLDivElement>();
  const setViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportEl.current = node;
      return measureViewport(node);
    },
    [measureViewport],
  );

  const fitScale = viewportWidth > 0 ? viewportWidth / HALL_W : 1;
  const maxZoom = Math.max(1, MAX_SCALE / fitScale);
  const zoomLevel = clamp(zoom, 1, maxZoom);
  const scale = fitScale * zoomLevel;

  const zones = useMemo(
    () => [...new Set(["hall", "terrace", "street", ...listZonesFromTables(value.tables)])],
    [value.tables],
  );
  if (!zones.includes(activeZone)) setActiveZone(zones[0] ?? "hall");

  const fixtures = useMemo(() => fixturesOf(value.fixtures, activeZone), [value.fixtures, activeZone]);
  const zoneTables = useMemo(() => value.tables.filter((t) => t.zone === activeZone), [value.tables, activeZone]);
  const items = useMemo(() => planItems(value.tables, fixtures, activeZone), [value.tables, fixtures, activeZone]);
  const conflicts = useMemo(() => findConflicts(items), [items]);

  const selectedTable = selectedId?.startsWith("t:")
    ? (zoneTables.find((t) => tableId(t.key) === selectedId) ?? null)
    : null;
  const selectedFixture: BoxKind | "entrance" | null =
    selectedId === "entrance"
      ? "entrance"
      : (selectedId === "bar" || selectedId === "kitchen") && fixtures[selectedId]
        ? selectedId
        : null;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // `at` changes on every call, so a repeated message restarts its timer.
  const flash = (text: string) => setNotice((prev) => ({ text, at: (prev?.at ?? 0) + 1 }));

  // —— commits (each one is an Undo step) ——

  function commitTables(tables: DraftTable[]) {
    onChange({ ...value, tables });
  }
  function patchTable(key: string, patch: Partial<DraftTable>) {
    commitTables(value.tables.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }
  function commitFixtures(next: ZoneFixtures) {
    onChange({ ...value, fixtures: { ...value.fixtures, [activeZone]: next } });
  }

  // —— coordinates & zoom ——

  function toHall(clientX: number, clientY: number): Point {
    const rect = canvasEl.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }

  function viewCenter(): Point {
    const vp = viewportEl.current;
    if (!vp) return { x: HALL_W / 2, y: HALL_H / 2 };
    return {
      x: (vp.scrollLeft + vp.clientWidth / 2) / scale,
      y: (vp.scrollTop + vp.clientHeight / 2) / scale,
    };
  }

  function zoomTo(next: number, focalClient?: Point) {
    const vp = viewportEl.current;
    const target = clamp(next, 1, maxZoom);
    if (!vp || Math.abs(target - zoomLevel) < 0.001) return;
    const box = vp.getBoundingClientRect();
    const view = focalClient
      ? { x: focalClient.x - box.left - vp.clientLeft, y: focalClient.y - box.top - vp.clientTop }
      : { x: vp.clientWidth / 2, y: vp.clientHeight / 2 };
    pendingFocal.current = {
      hall: { x: (vp.scrollLeft + view.x) / scale, y: (vp.scrollTop + view.y) / scale },
      view,
    };
    setZoom(target);
  }

  // Keep the point under the cursor / fingers (or the centre) in place while zooming.
  useLayoutEffect(() => {
    const focal = pendingFocal.current;
    const vp = viewportEl.current;
    if (!focal || !vp) return;
    pendingFocal.current = null;
    vp.scrollLeft = focal.hall.x * scale - focal.view.x;
    vp.scrollTop = focal.hall.y * scale - focal.view.y;
  }, [scale]);

  // Bring a newly added table into view when the plan is zoomed in.
  useEffect(() => {
    const key = revealKey.current;
    if (!key) return;
    revealKey.current = null;
    const el = viewportEl.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value.tables]);

  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    // Trackpad pinches send small deltas, mouse wheels ±100 per notch (or lines in Firefox).
    const delta = clamp(event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY, -40, 40);
    zoomTo(zoomLevel * Math.exp(-delta * 0.01), { x: event.clientX, y: event.clientY });
  });
  const touchMetrics = (touches: TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    return {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
      mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
    };
  };
  const onTouchStart = useEffectEvent((event: TouchEvent) => {
    if (event.touches.length !== 2) return;
    const current = dragRef.current;
    if (current?.moved) return; // a table is being dragged: keep dragging it
    if (current) {
      dragRef.current = null;
      setDrag(null);
    }
    event.preventDefault();
    pinchRef.current = { dist: touchMetrics(event.touches).dist, zoom: zoomLevel };
  });
  const onTouchMove = useEffectEvent((event: TouchEvent) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2) return;
    if (event.cancelable) event.preventDefault();
    const { dist, mid } = touchMetrics(event.touches);
    zoomTo((pinch.zoom * dist) / pinch.dist, mid);
  });
  const onTouchEnd = useEffectEvent((event: TouchEvent) => {
    if (event.touches.length < 2) pinchRef.current = null;
  });

  useEffect(() => {
    const vp = viewportEl.current;
    if (!vp) return;
    const wheel = (e: WheelEvent) => onWheel(e);
    const start = (e: TouchEvent) => onTouchStart(e);
    const move = (e: TouchEvent) => onTouchMove(e);
    const end = (e: TouchEvent) => onTouchEnd(e);
    vp.addEventListener("wheel", wheel, { passive: false });
    vp.addEventListener("touchstart", start, { passive: false });
    vp.addEventListener("touchmove", move, { passive: false });
    vp.addEventListener("touchend", end);
    vp.addEventListener("touchcancel", end);
    return () => {
      vp.removeEventListener("wheel", wheel);
      vp.removeEventListener("touchstart", start);
      vp.removeEventListener("touchmove", move);
      vp.removeEventListener("touchend", end);
      vp.removeEventListener("touchcancel", end);
    };
  }, []);

  function autoScroll(clientX: number, clientY: number) {
    const vp = viewportEl.current;
    if (!vp || (vp.scrollWidth <= vp.clientWidth && vp.scrollHeight <= vp.clientHeight)) return;
    const box = vp.getBoundingClientRect();
    const edge = 28;
    const step = 12;
    const dx = clientX < box.left + edge ? -step : clientX > box.right - edge ? step : 0;
    const dy = clientY < box.top + edge ? -step : clientY > box.bottom - edge ? step : 0;
    if (dx || dy) vp.scrollBy(dx, dy);
  }

  // —— dragging ——

  function beginDrag(event: ReactPointerEvent<HTMLElement>, next: Drag) {
    if (busy || dragRef.current || pinchRef.current) return false;
    if (event.pointerType === "mouse" && event.button !== 0) return false;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = next;
    setDrag(next);
    return true;
  }

  function dragBase(event: ReactPointerEvent<HTMLElement>, id: ItemId): DragBase {
    return {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      obstacles: obstaclesExcept(items, id),
    };
  }

  function startTableDrag(event: ReactPointerEvent<HTMLElement>, table: DraftTable) {
    const id = tableId(table.key);
    const p = toHall(event.clientX, event.clientY);
    const started = beginDrag(event, {
      ...dragBase(event, id),
      kind: "table",
      key: table.key,
      size: tableSize(table.seats, table.rot),
      offset: { x: p.x - table.x, y: p.y - table.y },
      at: { x: table.x, y: table.y },
      blocked: false,
      landing: null,
    });
    if (started) setSelectedId(id);
  }

  function startBoxDrag(event: ReactPointerEvent<HTMLElement>, kind: BoxKind, rect: Rect) {
    const p = toHall(event.clientX, event.clientY);
    const started = beginDrag(event, {
      ...dragBase(event, kind),
      kind: "box",
      id: kind,
      offset: { x: p.x - rect.x, y: p.y - rect.y },
      rect,
      blocked: false,
    });
    if (started) setSelectedId(kind);
  }

  function startResize(event: ReactPointerEvent<HTMLElement>, kind: BoxKind, rect: Rect) {
    beginDrag(event, { ...dragBase(event, kind), kind: "resize", id: kind, origin: rect, rect, blocked: false });
  }

  function startEntranceDrag(event: ReactPointerEvent<HTMLElement>, entrance: Entrance) {
    const started = beginDrag(event, { ...dragBase(event, "entrance"), kind: "entrance", entrance, blocked: false });
    if (started) setSelectedId("entrance");
  }

  function onDragMove(event: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d || event.pointerId !== d.pointerId) return;
    if (!d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_THRESHOLD) return;
    const p = toHall(event.clientX, event.clientY);
    let next: Drag | null = null;
    if (d.kind === "table") {
      const at = snapTableCenter({ x: p.x - d.offset.x, y: p.y - d.offset.y });
      if (!d.moved || at.x !== d.at.x || at.y !== d.at.y) {
        const fits = tableFits(at, d.size, d.obstacles);
        const landing = fits ? null : findFreeSpot(at, d.size, d.obstacles, PUSH_RADIUS);
        next = { ...d, moved: true, at, blocked: !fits, landing };
      }
    } else if (d.kind === "box") {
      const rect = snapBox({ x: p.x - d.offset.x, y: p.y - d.offset.y, w: d.rect.w, h: d.rect.h });
      next = { ...d, moved: true, rect, blocked: !boxFits(rect, d.obstacles) };
    } else if (d.kind === "resize") {
      const rect = resizeBox(d.origin, p);
      next = { ...d, moved: true, rect, blocked: !boxFits(rect, d.obstacles) };
    } else {
      const entrance = snapEntrance(p);
      next = { ...d, moved: true, entrance, blocked: !entranceFits(entrance, d.obstacles) };
    }
    if (next) {
      dragRef.current = next;
      setDrag(next);
    }
    autoScroll(event.clientX, event.clientY);
  }

  function onDragEnd(event: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d || event.pointerId !== d.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (!d.moved) return;
    if (d.kind === "table") {
      const table = value.tables.find((t) => t.key === d.key);
      if (!table) return;
      const target = d.blocked ? d.landing : d.at;
      if (!target) {
        flash(copy.dropRefused);
        return;
      }
      if (target.x !== table.x || target.y !== table.y) patchTable(d.key, target);
      if (d.blocked) flash(copy.pushed);
      return;
    }
    if (d.blocked) {
      flash(copy.dropRefused);
      return;
    }
    if (d.kind === "entrance") {
      const cur = fixtures.entrance;
      if (cur.side !== d.entrance.side || cur.at !== d.entrance.at) commitFixtures({ ...fixtures, entrance: d.entrance });
      return;
    }
    const cur = fixtures[d.id];
    if (!cur || cur.x !== d.rect.x || cur.y !== d.rect.y || cur.w !== d.rect.w || cur.h !== d.rect.h) {
      commitFixtures({ ...fixtures, [d.id]: d.rect });
    }
  }

  function onDragCancel(event: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d || event.pointerId !== d.pointerId) return;
    dragRef.current = null;
    setDrag(null);
  }

  const dragProps = {
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: onDragCancel,
    onLostPointerCapture: onDragCancel,
  };

  // Mouse: drag the empty floor to pan a zoomed plan; a plain click there clears the selection.
  function onViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const vp = viewportEl.current;
    if (!vp) return;
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: vp.scrollLeft,
      top: vp.scrollTop,
      moved: false,
    };
    if (event.pointerType === "mouse") vp.setPointerCapture?.(event.pointerId);
  }
  function onViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const vp = viewportEl.current;
    if (!pan || !vp || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    pan.moved = true;
    if (event.pointerType === "mouse") {
      vp.scrollLeft = pan.left - dx;
      vp.scrollTop = pan.top - dy;
    }
  }
  function onViewportPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panRef.current = null;
    if (!pan.moved) setSelectedId(null);
  }
  function onViewportPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  }

  // —— actions ——

  function addTable(seats: number) {
    const size = tableSize(seats);
    const obstacles = items.map((i) => i.rect);
    const prev = selectedTable;
    const preferred = prev
      ? { x: prev.x + tableSize(prev.seats, prev.rot).w / 2 + size.w / 2 + GRID, y: prev.y }
      : viewCenter();
    const spot = findFreeSpot(snapTableCenter(preferred), size, obstacles);
    if (!spot) {
      flash(copy.noFreeSpot);
      return;
    }
    const key = newTableKey();
    revealKey.current = key;
    commitTables([
      ...value.tables,
      {
        key,
        number: nextTableNumber(value.tables.map((t) => t.number)),
        seats,
        x: spot.x,
        y: spot.y,
        rot: 0,
        zone: activeZone,
        status: "FREE",
        locked: false,
      },
    ]);
    setSelectedId(tableId(key));
  }

  function resizeTable(table: DraftTable, seats: number, rot: Rot, failText: string) {
    const obstacles = obstaclesExcept(items, tableId(table.key));
    const at = placeNear({ x: table.x, y: table.y }, tableSize(seats, rot), obstacles);
    if (!at) {
      flash(failText);
      return;
    }
    patchTable(table.key, { seats, rot, x: at.x, y: at.y });
  }

  function moveTableToZone(table: DraftTable, zone: string) {
    if (zone === table.zone) return;
    const others = value.tables.filter((t) => t.key !== table.key);
    const obstacles = planItems(others, fixturesOf(value.fixtures, zone), zone).map((i) => i.rect);
    const size = tableSize(table.seats, table.rot);
    const at = placeNear({ x: table.x, y: table.y }, size, obstacles, Number.POSITIVE_INFINITY);
    if (!at) {
      flash(copy.noFreeSpot);
      return;
    }
    patchTable(table.key, { zone, x: at.x, y: at.y });
    setActiveZone(zone);
  }

  /** Keeps keyboard focus (and so Ctrl+Z) inside the editor when the focused item disappears. */
  function focusPlan() {
    viewportEl.current?.focus({ preventScroll: true });
  }

  function deleteTable(table: DraftTable) {
    if (table.locked) return;
    commitTables(value.tables.filter((t) => t.key !== table.key));
    setSelectedId(null);
    focusPlan();
  }

  function toggleBox(kind: BoxKind) {
    if (fixtures[kind]) {
      commitFixtures({ ...fixtures, [kind]: null });
      if (selectedId === kind) {
        setSelectedId(null);
        focusPlan();
      }
      return;
    }
    const rect = findFreeBox(defaultBox(kind), items.map((i) => i.rect));
    if (!rect) {
      flash(copy.noFreeSpot);
      return;
    }
    commitFixtures({ ...fixtures, [kind]: rect });
    setSelectedId(kind);
  }

  function applyTemplate(id: FloorTemplateId) {
    commitTables(applyFloorTemplate(value, id, newTableKey));
    setActiveZone("hall");
    setSelectedId(null);
  }

  function nudge(dx: number, dy: number) {
    if (selectedTable) {
      const t = selectedTable;
      const at = snapTableCenter({ x: t.x + dx, y: t.y + dy });
      if (at.x === t.x && at.y === t.y) return;
      if (!tableFits(at, tableSize(t.seats, t.rot), obstaclesExcept(items, tableId(t.key)))) {
        flash(copy.spotTaken);
        return;
      }
      patchTable(t.key, at);
      return;
    }
    if (selectedFixture === "entrance") {
      const e = fixtures.entrance;
      const along = e.side === "top" || e.side === "bottom";
      const delta = along ? dx : dy;
      if (!delta) return;
      const wallPoint =
        e.side === "top"
          ? { x: e.at + delta, y: 0 }
          : e.side === "bottom"
            ? { x: e.at + delta, y: HALL_H }
            : e.side === "left"
              ? { x: 0, y: e.at + delta }
              : { x: HALL_W, y: e.at + delta };
      const next = snapEntrance(wallPoint);
      if (next.at === e.at) return;
      if (!entranceFits(next, obstaclesExcept(items, "entrance"))) {
        flash(copy.spotTaken);
        return;
      }
      commitFixtures({ ...fixtures, entrance: next });
      return;
    }
    if (selectedFixture) {
      const r = fixtures[selectedFixture];
      if (!r) return;
      const next = snapBox({ ...r, x: r.x + dx, y: r.y + dy });
      if (next.x === r.x && next.y === r.y) return;
      if (!boxFits(next, obstaclesExcept(items, selectedFixture))) {
        flash(copy.spotTaken);
        return;
      }
      commitFixtures({ ...fixtures, [selectedFixture]: next });
    }
  }

  function onCanvasKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (busy || isTextField(event.target)) return;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = arrows[event.key];
    if (dir && (selectedTable || selectedFixture)) {
      event.preventDefault();
      const step = event.shiftKey ? GRID * 5 : GRID;
      nudge(dir[0] * step, dir[1] * step);
      return;
    }
    if (event.key === "Escape") {
      if (dragRef.current) {
        dragRef.current = null;
        setDrag(null);
      } else {
        setSelectedId(null);
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedTable) {
        event.preventDefault();
        deleteTable(selectedTable);
      } else if (selectedFixture === "bar" || selectedFixture === "kitchen") {
        event.preventDefault();
        toggleBox(selectedFixture);
      }
      return;
    }
    if ((event.key === "r" || event.key === "R") && selectedTable && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      resizeTable(selectedTable, selectedTable.seats, selectedTable.rot === 90 ? 0 : 90, copy.noRoomToRotate);
    }
  }

  function onEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (isTextField(event.target) || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      if (canUndo) onUndo();
    } else if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      if (canRedo) onRedo();
    }
  }

  // —— render ——

  const seatWord = (n: number) => pluralize(n, copy.seatWord, locale);
  const zoneOptions = [...new Set([...FLOOR_ZONE_PRESETS.map((z) => z.id as string), ...zones])].map((id) => ({
    value: id,
    label: zoneLabel(id, locale),
  }));
  const templateNames: Record<FloorTemplateId, string> = {
    small: copy.presetSmall,
    cafe: copy.presetCafe,
    hall: copy.presetHall,
  };
  const draggingTable = drag?.kind === "table" && drag.moved ? drag : null;
  const fitHeight = HALL_H * fitScale;

  return (
    <div className={`floor-editor ${busy ? "busy" : ""}`} onKeyDown={onEditorKeyDown}>
      <div className="floor-editor-toolbar">
        <div className="floor-toolbar-row">
          <div className="seg floor-zone-tabs" role="tablist" aria-label={copy.zones}>
            {zones.map((zone) => (
              <button
                key={zone}
                type="button"
                role="tab"
                aria-selected={activeZone === zone}
                className={`seg-item${activeZone === zone ? " is-active" : ""}`}
                onClick={() => {
                  setActiveZone(zone);
                  setSelectedId(null);
                }}
              >
                {zoneLabel(zone, locale)}
                <small>{value.tables.filter((t) => t.zone === zone).length}</small>
              </button>
            ))}
          </div>
          <div className="floor-view-tools" role="toolbar" aria-label={copy.tools}>
            <button type="button" className="btn btn--ghost btn--sm btn--icon floor-icon-btn" disabled={busy || !canUndo} onClick={onUndo} title={`${copy.undo} (Ctrl+Z)`} aria-label={copy.undo}>
              <UndoIcon />
            </button>
            <button type="button" className="btn btn--ghost btn--sm btn--icon floor-icon-btn" disabled={busy || !canRedo} onClick={onRedo} title={`${copy.redo} (Ctrl+Shift+Z)`} aria-label={copy.redo}>
              <UndoIcon flip />
            </button>
            <span className="floor-tools-sep" aria-hidden="true" />
            <button type="button" className="btn btn--ghost btn--sm btn--icon floor-icon-btn" disabled={zoomLevel <= 1} onClick={() => zoomTo(zoomLevel / ZOOM_STEP)} title={copy.zoomOut} aria-label={copy.zoomOut}>
              <span aria-hidden="true">−</span>
            </button>
            <output className="floor-zoom-level" aria-label={copy.zoomLevel}>
              {Math.round(scale * 100)}%
            </output>
            <button type="button" className="btn btn--ghost btn--sm btn--icon floor-icon-btn" disabled={zoomLevel >= maxZoom - 0.001} onClick={() => zoomTo(zoomLevel * ZOOM_STEP)} title={copy.zoomIn} aria-label={copy.zoomIn}>
              <span aria-hidden="true">+</span>
            </button>
            <button type="button" className="btn btn--ghost btn--sm btn--icon floor-icon-btn" disabled={zoomLevel <= 1} onClick={() => zoomTo(1)} title={copy.zoomFit} aria-label={copy.zoomFit}>
              <FitIcon />
            </button>
          </div>
        </div>

        <div className="floor-editor-actions">
          <div className="floor-actions-group">
            <span className="floor-actions-label">
              <PlusIcon />
              {copy.addTable}
            </span>
            <div className="floor-actions-pills">
              {SEAT_PRESETS.map((seats) => {
                const title = fill(copy.addTableTitle, { n: seats, seats: seatWord(seats) });
                return (
                  <button
                    key={seats}
                    type="button"
                    className="chip floor-add-pill"
                    disabled={busy}
                    onClick={() => addTable(seats)}
                    title={title}
                    aria-label={title}
                  >
                    <span className="floor-pill-seats-icon" aria-hidden="true">
                      {seats}
                    </span>
                    <span aria-hidden="true">{seatWord(seats)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="floor-actions-group">
            <span className="floor-actions-label">{copy.onPlan}</span>
            <div className="floor-actions-pills">
              {(["bar", "kitchen"] as const).map((kind) => {
                const on = !!fixtures[kind];
                const name = copy[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    className={`chip floor-toggle-pill${on ? " is-active" : ""}`}
                    aria-pressed={on}
                    disabled={busy}
                    title={fill(on ? copy.hideFixture : copy.showFixture, { name })}
                    onClick={() => toggleBox(kind)}
                  >
                    <span className="floor-toggle-mark" aria-hidden="true">
                      {on ? "✓" : "+"}
                    </span>
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="floor-actions-group templates">
            <span className="floor-actions-label">{copy.presets}</span>
            <div className="floor-actions-pills">
              {TEMPLATES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="chip floor-template-pill"
                  disabled={busy}
                  onClick={() => (value.tables.some((t) => !t.locked) ? setAskTemplate(id) : applyTemplate(id))}
                >
                  {templateNames[id]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="floor-editor-stage">
        <div className="floor-editor-canvas-col">
          <div
            ref={setViewport}
            className={`hall-viewport ${zoomLevel > 1 ? "zoomed" : ""}`}
            style={{
              height: HALL_H * scale,
              maxHeight: `max(${fitHeight}px, min(62vh, 560px))`,
            }}
            role="application"
            tabIndex={0}
            aria-label={fill(copy.plan, { zone: zoneLabel(activeZone, locale) })}
            aria-describedby={hintId}
            onKeyDown={onCanvasKeyDown}
            onPointerDown={onViewportPointerDown}
            onPointerMove={onViewportPointerMove}
            onPointerUp={onViewportPointerUp}
            onPointerCancel={onViewportPointerCancel}
          >
            <HallFrame scale={scale} canvasRef={canvasEl} canvasClassName="grid editing">
              {(["bar", "kitchen"] as const).map((kind) => {
                const live =
                  drag && (drag.kind === "box" || drag.kind === "resize") && drag.id === kind && drag.moved ? drag : null;
                const rect = live ? live.rect : fixtures[kind];
                if (!rect) return null;
                const selected = selectedId === kind;
                const cls = [
                  selected ? "selected" : "",
                  live ? "dragging" : "",
                  live?.blocked ? "blocked" : "",
                  !live && conflicts.has(kind) ? "conflict" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <FixtureBox
                    key={kind}
                    as="button"
                    kind={kind}
                    rect={rect}
                    label={copy[kind]}
                    className={cls}
                    aria-pressed={selected}
                    aria-label={copy[kind]}
                    onPointerDown={(e) => startBoxDrag(e, kind, fixtures[kind]!)}
                    onFocus={() => setSelectedId(kind)}
                    {...dragProps}
                  >
                    {selected && (
                      // Moves of the captured handle bubble to the block's own drag handlers.
                      <span
                        className="hall-resize"
                        aria-hidden="true"
                        onPointerDown={(e) => startResize(e, kind, fixtures[kind]!)}
                      />
                    )}
                  </FixtureBox>
                );
              })}

              {(() => {
                const live = drag?.kind === "entrance" && drag.moved ? drag : null;
                const selected = selectedId === "entrance";
                const cls = [
                  selected ? "selected" : "",
                  live ? "dragging" : "",
                  live?.blocked ? "blocked" : "",
                  !live && conflicts.has("entrance") ? "conflict" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <EntranceMark
                    as="button"
                    entrance={live ? live.entrance : fixtures.entrance}
                    label={copy.entrance}
                    className={cls}
                    aria-pressed={selected}
                    aria-label={copy.entrance}
                    onPointerDown={(e) => startEntranceDrag(e, fixtures.entrance)}
                    onFocus={() => setSelectedId("entrance")}
                    {...dragProps}
                  />
                );
              })()}

              {draggingTable?.blocked && draggingTable.landing && (
                <div className="hall-ghost" style={rectStyle(rectAround(draggingTable.landing, draggingTable.size))} aria-hidden="true" />
              )}

              {zoneTables.map((t) => {
                const id = tableId(t.key);
                const live = draggingTable?.key === t.key ? draggingTable : null;
                const at = live ? live.at : t;
                const selected = selectedId === id;
                const cls = [
                  "fa-table",
                  "schematic",
                  tableStatusClass(t.status),
                  seatingClass(t.seats),
                  rotClass(t.rot),
                  selected ? "selected" : "",
                  live ? "dragging" : "",
                  live?.blocked ? "blocked" : "",
                  !live && conflicts.has(id) ? "conflict" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={t.key}
                    type="button"
                    data-key={t.key}
                    className={cls}
                    style={{ left: at.x, top: at.y }}
                    aria-pressed={selected}
                    aria-label={fill(copy.tableA11y, { n: t.number, count: t.seats, seats: seatWord(t.seats) })}
                    onPointerDown={(e) => startTableDrag(e, t)}
                    onFocus={() => setSelectedId(id)}
                    {...dragProps}
                  >
                    <SeatingMarks seats={t.seats} />
                    <span>{t.number}</span>
                  </button>
                );
              })}
            </HallFrame>
          </div>
          <p className="floor-editor-toast" role="status" aria-live="polite">
            {notice ? <span key={notice.at}>{notice.text}</span> : null}
          </p>
          {conflicts.size > 0 && (
            <p className="floor-editor-warn">{fill(copy.conflicts, { n: conflicts.size })}</p>
          )}
        </div>

        <aside className="floor-editor-side" aria-label={copy.inspector}>
          {selectedTable ? (
            <TableInspector
              key={`${selectedTable.key}:${selectedTable.number}`}
              table={selectedTable}
              otherNumbers={value.tables.filter((t) => t.key !== selectedTable.key).map((t) => t.number)}
              zoneOptions={zoneOptions}
              busy={busy}
              copy={copy}
              seatWord={seatWord}
              onNumber={(number) => patchTable(selectedTable.key, { number })}
              onSeats={(seats) => resizeTable(selectedTable, seats, selectedTable.rot, copy.noRoomToGrow)}
              onRotate={() =>
                resizeTable(selectedTable, selectedTable.seats, selectedTable.rot === 90 ? 0 : 90, copy.noRoomToRotate)
              }
              onZone={(zone) => moveTableToZone(selectedTable, zone)}
              onDelete={() => deleteTable(selectedTable)}
            />
          ) : selectedFixture ? (
            <>
              <h4>{copy[selectedFixture]}</h4>
              <p className="floor-editor-note">
                {selectedFixture === "entrance" ? copy.entranceHint : copy.boxHint}
              </p>
              {selectedFixture !== "entrance" && (
                <button
                  type="button"
                  className="btn btn--danger-outline btn--sm floor-editor-danger"
                  disabled={busy}
                  onClick={() => toggleBox(selectedFixture)}
                >
                  {copy.removeFromPlan}
                </button>
              )}
            </>
          ) : (
            <>
              <h4>{copy.inspector}</h4>
              <p className="floor-editor-note">{copy.inspectorEmpty}</p>
            </>
          )}
          <p className="floor-editor-hint floor-keys-hint" id={hintId}>
            {copy.keysHint}
          </p>
          <p className="floor-editor-hint">{copy.zonesHint}</p>
        </aside>
      </div>

      <CabinetConfirmDialog
        open={askTemplate !== null}
        tone="warning"
        title={copy.presetConfirmTitle}
        text={fill(copy.presetConfirmText, { name: askTemplate ? templateNames[askTemplate] : "" })}
        confirmLabel={copy.presetConfirmBtn}
        cancelLabel={getSiteCopy(locale).cabinet.opsMenuCancel}
        onCancel={() => setAskTemplate(null)}
        onConfirm={() => {
          if (askTemplate) applyTemplate(askTemplate);
          setAskTemplate(null);
        }}
      />
    </div>
  );
}

function TableInspector({
  table,
  otherNumbers,
  zoneOptions,
  busy,
  copy,
  seatWord,
  onNumber,
  onSeats,
  onRotate,
  onZone,
  onDelete,
}: {
  table: DraftTable;
  otherNumbers: number[];
  zoneOptions: { value: string; label: string }[];
  busy: boolean;
  copy: FloorCopy;
  seatWord: (n: number) => string;
  onNumber: (n: number) => void;
  onSeats: (n: number) => void;
  onRotate: () => void;
  onZone: (zone: string) => void;
  onDelete: () => void;
}) {
  const numberId = useId();
  const errorId = useId();
  const zoneId = useId();
  const [text, setText] = useState(String(table.number));
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (text.trim() === String(table.number)) {
      setText(String(table.number));
      setError(null);
      return;
    }
    const check = checkTableNumber(text, otherNumbers);
    if (!check.ok) {
      setError(check.error === "taken" ? fill(copy.numberTaken, { n: text.trim() }) : copy.numberInvalid);
      return;
    }
    setError(null);
    onNumber(check.value);
  }

  return (
    <>
      <h4>{fill(copy.tableTitle, { n: table.number })}</h4>
      <div className="floor-field">
        <label htmlFor={numberId}>{copy.number}</label>
        <input
          id={numberId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          disabled={busy || table.locked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setText(String(table.number));
              setError(null);
            }
          }}
        />
        {error && (
          <p className="floor-field-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="floor-field">
        <span>{copy.seats}</span>
        <div className="floor-stepper">
          <button
            type="button"
            className="stepper-btn"
            aria-label={copy.seatsLess}
            title={copy.seatsLess}
            disabled={busy || table.seats <= SEATS_MIN}
            onClick={() => onSeats(table.seats - 1)}
          >
            −
          </button>
          <output aria-live="polite">
            {table.seats} <small>{seatWord(table.seats)}</small>
          </output>
          <button
            type="button"
            className="stepper-btn"
            aria-label={copy.seatsMore}
            title={copy.seatsMore}
            disabled={busy || table.seats >= SEATS_MAX}
            onClick={() => onSeats(table.seats + 1)}
          >
            +
          </button>
        </div>
      </div>
      <div className="floor-field">
        <span id={zoneId}>{copy.zone}</span>
        <SelectMenu
          value={table.zone}
          disabled={busy}
          onChange={onZone}
          options={zoneOptions}
          ariaLabelledBy={zoneId}
          fullWidth
        />
      </div>
      <div className="floor-inspector-actions">
        <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={onRotate}>
          <RotateIcon />
          {copy.rotate}
        </button>
        {!table.locked && (
          <button type="button" className="btn btn--danger-outline btn--sm" disabled={busy} onClick={onDelete}>
            {copy.deleteTable}
          </button>
        )}
      </div>
      {table.locked && <p className="floor-editor-note">{copy.lockedHint}</p>}
    </>
  );
}

function UndoIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

function FitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}
