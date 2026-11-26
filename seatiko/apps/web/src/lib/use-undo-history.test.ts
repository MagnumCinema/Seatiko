import { describe, expect, it } from "vitest";
import { UNDO_LIMIT, undoReducer, type UndoHistory } from "./use-undo-history";

const start: UndoHistory<number> = { past: [], present: 0, future: [] };

describe("undoReducer", () => {
  it("undoes and redoes steps in order", () => {
    let s = undoReducer(start, { type: "push", value: 1 });
    s = undoReducer(s, { type: "push", value: 2 });
    s = undoReducer(s, { type: "undo" });
    expect(s.present).toBe(1);
    s = undoReducer(s, { type: "undo" });
    expect(s.present).toBe(0);
    expect(undoReducer(s, { type: "undo" })).toBe(s);
    s = undoReducer(s, { type: "redo" });
    s = undoReducer(s, { type: "redo" });
    expect(s.present).toBe(2);
    expect(undoReducer(s, { type: "redo" })).toBe(s);
  });

  it("drops the redo branch after a new step", () => {
    let s = undoReducer(start, { type: "push", value: 1 });
    s = undoReducer(s, { type: "undo" });
    s = undoReducer(s, { type: "push", value: 5 });
    expect(s.future).toEqual([]);
    expect(s.past).toEqual([0]);
  });

  it("ignores pushing the same value and caps the history", () => {
    const same = undoReducer(start, { type: "push", value: 0 });
    expect(same).toBe(start);
    let s = start;
    for (let i = 1; i <= UNDO_LIMIT + 20; i += 1) s = undoReducer(s, { type: "push", value: i });
    expect(s.past).toHaveLength(UNDO_LIMIT);
  });

  it("reset starts a fresh history", () => {
    let s = undoReducer(start, { type: "push", value: 1 });
    s = undoReducer(s, { type: "reset", value: 9 });
    expect(s).toEqual({ past: [], present: 9, future: [] });
  });
});
