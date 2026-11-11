import {
  BUDGET_PRESET_IDS,
  budgetPresetRange,
  normalizeBudgetRange,
  type BudgetPresetId,
  type CuisineId,
  type DiscoverPreferences,
  type OccasionId,
  type PracticalId,
  type RestaurantTypeId,
} from "./discover-preferences";

export type ChatDimension =
  | "cuisine"
  | "restaurantType"
  | "budget"
  | "occasion"
  | "practical";

export type ChatStep = {
  dimension: ChatDimension;
  /** key into site-copy.discover.chatQuestions */
  questionKey: ChatDimension;
};

export const CHAT_STEPS: ChatStep[] = [
  { dimension: "cuisine", questionKey: "cuisine" },
  { dimension: "restaurantType", questionKey: "restaurantType" },
  { dimension: "budget", questionKey: "budget" },
  { dimension: "occasion", questionKey: "occasion" },
  { dimension: "practical", questionKey: "practical" },
];

export function nextChatStepIndex(current: number, skipped: boolean): number {
  void skipped;
  return Math.min(current + 1, CHAT_STEPS.length);
}

function unionIds<T extends string | number>(existing: T[], incoming: T[]): T[] {
  const out = [...existing];
  for (const id of incoming) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function applyChatAnswer(
  prefs: DiscoverPreferences,
  dimension: ChatDimension,
  ids: string[],
): DiscoverPreferences {
  switch (dimension) {
    case "cuisine":
      return {
        ...prefs,
        cuisine: unionIds(prefs.cuisine, ids as CuisineId[]),
      };
    case "restaurantType":
      return {
        ...prefs,
        restaurantType: unionIds(
          prefs.restaurantType,
          ids as RestaurantTypeId[],
        ),
      };
    case "budget": {
      const raw = ids[0];
      if (!raw || raw === "any") return { ...prefs, budget: null };
      if ((BUDGET_PRESET_IDS as readonly string[]).includes(raw)) {
        const preset = budgetPresetRange(raw as BudgetPresetId);
        if (preset) return { ...prefs, budget: preset };
      }
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(raw);
      if (m) {
        return {
          ...prefs,
          budget: normalizeBudgetRange({
            min: Number(m[1]),
            max: Number(m[2]),
          }),
        };
      }
      return prefs;
    }
    case "occasion":
      return {
        ...prefs,
        occasion: unionIds(prefs.occasion, ids as OccasionId[]),
      };
    case "practical":
      return {
        ...prefs,
        practical: unionIds(prefs.practical, ids as PracticalId[]),
      };
  }
}

export function isChatComplete(stepIndex: number): boolean {
  return stepIndex >= CHAT_STEPS.length;
}
