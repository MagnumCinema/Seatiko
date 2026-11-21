/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { collapseHeightForChipRows } from "./preference-stepper";

function mockRect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeChip(top: number, height = 40): HTMLElement {
  const el = document.createElement("button");
  el.className = "discover-chip";
  el.getBoundingClientRect = () => mockRect(top, height);
  return el;
}

describe("collapseHeightForChipRows", () => {
  it("returns null when chips fit in two rows", () => {
    const container = document.createElement("div");
    container.getBoundingClientRect = () => mockRect(100, 200);
    container.append(makeChip(100), makeChip(100), makeChip(148), makeChip(148));

    expect(collapseHeightForChipRows(container, 2)).toBeNull();
  });

  it("returns height of the first two rows when a third exists", () => {
    const container = document.createElement("div");
    container.getBoundingClientRect = () => mockRect(100, 200);
    // tops relative to viewport; container at 100 → relative tops 0, 48, 96
    container.append(
      makeChip(100),
      makeChip(100),
      makeChip(148),
      makeChip(148),
      makeChip(196),
      makeChip(196),
    );

    expect(collapseHeightForChipRows(container, 2)).toBe(88);
  });
});
