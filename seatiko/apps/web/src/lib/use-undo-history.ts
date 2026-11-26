import { useCallback, useReducer } from "react";

export type UndoHistory<T> = { past: T[]; present: T; future: T[] };

export type UndoAction<T> =
  | { type: "push"; value: T }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

/** How many steps Undo can go back. */
export const UNDO_LIMIT = 100;

export function undoReducer<T>(state: UndoHistory<T>, action: UndoAction<T>): UndoHistory<T> {
  switch (action.type) {
    case "push":
      if (Object.is(action.value, state.present)) return state;
      return {
        past: [...state.past, state.present].slice(-UNDO_LIMIT),
        present: action.value,
        future: [],
      };
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    case "reset":
      return { past: [], present: action.value, future: [] };
  }
}

/** A value with Undo / Redo: `push` records a step, `reset` starts a fresh history (after load or save). */
export function useUndoHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(
    undoReducer as (s: UndoHistory<T>, a: UndoAction<T>) => UndoHistory<T>,
    { past: [], present: initial, future: [] },
  );
  const push = useCallback((value: T) => dispatch({ type: "push", value }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);
  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    push,
    undo,
    redo,
    reset,
  };
}
