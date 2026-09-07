import {
  type BudgetLevel,
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

export function nextChatStepIndex(current: number, _skipped: boolean): number {
  return Math.min(current + 1, CHAT_STEPS.length);
}

export function applyChatAnswer(
  prefs: DiscoverPreferences,
  dimension: ChatDimension,
  ids: string[],
): DiscoverPreferences {
  switch (dimension) {
    case "cuisine":
      return { ...prefs, cuisine: ids as CuisineId[] };
    case "restaurantType":
      return { ...prefs, restaurantType: ids as RestaurantTypeId[] };
    case "budget":
      return {
        ...prefs,
        budget: ids.map(Number).filter((n): n is BudgetLevel => n === 1 || n === 2 || n === 3),
      };
    case "occasion":
      return { ...prefs, occasion: ids as OccasionId[] };
    case "practical":
      return { ...prefs, practical: ids as PracticalId[] };
  }
}

export function isChatComplete(stepIndex: number): boolean {
  return stepIndex >= CHAT_STEPS.length;
}
