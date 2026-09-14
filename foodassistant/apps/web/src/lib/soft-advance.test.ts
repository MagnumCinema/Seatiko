import { describe, expect, it } from "vitest";
import {
  SOFT_ADVANCE_MS,
  canSoftAdvanceOnTimer,
  planSoftAdvance,
  formatStepperStatus,
} from "./soft-advance";

describe("planSoftAdvance", () => {
  it("schedules 800ms when a step has selections and is not last", () => {
    expect(
      planSoftAdvance({ selectedCount: 1, stepIndex: 0, totalSteps: 5 }),
    ).toEqual({ type: "schedule", ms: SOFT_ADVANCE_MS });
    expect(SOFT_ADVANCE_MS).toBe(800);
  });

  it("cancels when selection count drops to zero", () => {
    expect(
      planSoftAdvance({ selectedCount: 0, stepIndex: 1, totalSteps: 5 }),
    ).toEqual({ type: "cancel" });
  });

  it("cancels on the last step even with selections", () => {
    expect(
      planSoftAdvance({ selectedCount: 2, stepIndex: 4, totalSteps: 5 }),
    ).toEqual({ type: "cancel" });
  });
});

describe("canSoftAdvanceOnTimer", () => {
  it("advances only with selections and not on last step", () => {
    expect(canSoftAdvanceOnTimer({ selectedCount: 1, stepIndex: 2, totalSteps: 5 })).toBe(true);
    expect(canSoftAdvanceOnTimer({ selectedCount: 0, stepIndex: 2, totalSteps: 5 })).toBe(false);
    expect(canSoftAdvanceOnTimer({ selectedCount: 3, stepIndex: 4, totalSteps: 5 })).toBe(false);
  });
});

describe("formatStepperStatus", () => {
  it("builds plain-text status without button chrome", () => {
    expect(
      formatStepperStatus({
        stepLabel: "Step 2 of 5",
        selectedLabel: "1 selected",
        continuingLabel: "Continuing…",
        continuing: false,
      }),
    ).toBe("Step 2 of 5 · 1 selected");

    expect(
      formatStepperStatus({
        stepLabel: "Step 2 of 5",
        selectedLabel: "1 selected",
        continuingLabel: "Continuing…",
        continuing: true,
      }),
    ).toBe("Step 2 of 5 · 1 selected · Continuing…");
  });
});
