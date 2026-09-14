export const SOFT_ADVANCE_MS = 800;

export type SoftAdvancePlan =
  | { type: "schedule"; ms: number }
  | { type: "cancel" };

export function planSoftAdvance(input: {
  selectedCount: number;
  stepIndex: number;
  totalSteps: number;
}): SoftAdvancePlan {
  if (input.stepIndex >= input.totalSteps - 1) return { type: "cancel" };
  if (input.selectedCount <= 0) return { type: "cancel" };
  return { type: "schedule", ms: SOFT_ADVANCE_MS };
}

export function canSoftAdvanceOnTimer(input: {
  selectedCount: number;
  stepIndex: number;
  totalSteps: number;
}): boolean {
  return input.selectedCount > 0 && input.stepIndex < input.totalSteps - 1;
}

export function formatStepperStatus(input: {
  stepLabel: string;
  selectedLabel: string;
  continuingLabel: string;
  continuing: boolean;
}): string {
  const base = `${input.stepLabel} · ${input.selectedLabel}`;
  return input.continuing ? `${base} · ${input.continuingLabel}` : base;
}
