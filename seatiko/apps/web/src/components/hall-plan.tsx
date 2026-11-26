"use client";

import { useCallback, useState, type CSSProperties, type HTMLAttributes } from "react";
import {
  DOOR_LEN,
  HALL_H,
  HALL_W,
  entranceRect,
  type BoxKind,
  type Entrance,
  type Rect,
  type Rot,
  type ZoneFixtures,
} from "@/lib/floor-layout";

function contentWidth(node: HTMLElement) {
  const style = getComputedStyle(node);
  return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** Content-box width of an element, kept current with a ResizeObserver (0 until it is mounted). */
export function useElementWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => {
    if (!node) return;
    setWidth(contentWidth(node));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(contentWidth(node)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Inline position of a hall rectangle (the canvas is HALL_W × HALL_H CSS px before scaling). */
export function rectStyle(r: Rect): CSSProperties {
  return { left: r.x, top: r.y, width: r.w, height: r.h };
}

/** Class that turns a schematic table by 90° (chairs move to the top and bottom). */
export function rotClass(rot: Rot | undefined) {
  return rot === 90 ? "rot90" : "";
}

/** The scaled hall: a fixed HALL_W × HALL_H canvas, drawn at `scale` inside a frame of the scaled size. */
export function HallFrame({
  scale,
  className = "",
  canvasClassName = "",
  canvasRef,
  overlay,
  children,
  ...rest
}: {
  scale: number;
  className?: string;
  canvasClassName?: string;
  canvasRef?: React.Ref<HTMLDivElement>;
  overlay?: React.ReactNode;
  children: React.ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div
      className={`hall-frame ${className}`.trim()}
      style={{ width: HALL_W * scale, height: HALL_H * scale }}
      {...rest}
    >
      <div
        ref={canvasRef}
        className={`hall-canvas ${canvasClassName}`.trim()}
        style={{ transform: `scale(${scale})`, ["--hall-inv" as string]: 1 / scale }}
      >
        {children}
      </div>
      {overlay}
    </div>
  );
}

/** Bar or kitchen block. Tall narrow blocks get vertical text, like a bar counter along a wall. */
export function FixtureBox({
  kind,
  rect,
  label,
  className = "",
  as = "div",
  children,
  ...rest
}: {
  kind: BoxKind;
  rect: Rect;
  label: string;
  className?: string;
  as?: "div" | "button";
  children?: React.ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  const vertical = rect.h > rect.w * 1.4;
  const Tag = as;
  return (
    <Tag
      {...(as === "button" ? { type: "button" as const } : {})}
      className={`hall-fixture ${kind} ${vertical ? "vertical" : ""} ${className}`.trim()}
      style={rectStyle(rect)}
      {...rest}
    >
      <span className="hall-fixture-label">{label}</span>
      {children}
    </Tag>
  );
}

/** Arrow pointing into the hall from the wall the door is on. */
const DOOR_ARROW_TURN: Record<Entrance["side"], number> = { bottom: 0, top: 180, left: 90, right: -90 };

/** Entrance: the door on the wall plus the walkway in front of it that tables must keep clear. */
export function EntranceMark({
  entrance,
  label,
  className = "",
  as = "div",
  ...rest
}: {
  entrance: Entrance;
  label: string;
  className?: string;
  as?: "div" | "button";
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  const Tag = as;
  return (
    <Tag
      {...(as === "button" ? { type: "button" as const } : {})}
      className={`hall-door side-${entrance.side} ${className}`.trim()}
      style={{ ...rectStyle(entranceRect(entrance)), ["--door-len" as string]: `${DOOR_LEN}px` }}
      {...rest}
    >
      <i className="hall-door-slab" aria-hidden="true" />
      <span className="hall-door-label">
        <svg
          className="hall-door-arrow"
          viewBox="0 0 12 12"
          aria-hidden="true"
          style={{ transform: `rotate(${DOOR_ARROW_TURN[entrance.side]}deg)` }}
        >
          <path d="M6 10.5V1.8M2.4 5.2 6 1.6l3.6 3.6" />
        </svg>
        <span>{label}</span>
      </span>
    </Tag>
  );
}

/** Read-only fixtures of a zone, as guests see them. */
export function HallFixtures({
  fixtures,
  labels,
}: {
  fixtures: ZoneFixtures;
  labels: { bar: string; kitchen: string; entrance: string };
}) {
  return (
    <>
      {fixtures.bar && <FixtureBox kind="bar" rect={fixtures.bar} label={labels.bar} aria-hidden="true" />}
      {fixtures.kitchen && (
        <FixtureBox kind="kitchen" rect={fixtures.kitchen} label={labels.kitchen} aria-hidden="true" />
      )}
      <EntranceMark entrance={fixtures.entrance} label={labels.entrance} aria-hidden="true" />
    </>
  );
}
