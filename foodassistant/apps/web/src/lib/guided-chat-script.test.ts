import { describe, expect, it } from "vitest";
import {
  CHAT_STEPS,
  applyChatAnswer,
  nextChatStepIndex,
} from "./guided-chat-script";
import { emptyPreferences } from "./discover-preferences";

describe("guided-chat-script", () => {
  it("has five steps matching preference dimensions", () => {
    expect(CHAT_STEPS.map((s) => s.dimension)).toEqual([
      "cuisine",
      "restaurantType",
      "budget",
      "occasion",
      "practical",
    ]);
  });

  it("applyChatAnswer merges chip ids into prefs", () => {
    const prefs = applyChatAnswer(emptyPreferences(), "cuisine", ["italian"]);
    expect(prefs.cuisine).toEqual(["italian"]);
  });

  it("skip advances without changing prefs", () => {
    const prefs = emptyPreferences();
    expect(nextChatStepIndex(0, true)).toBe(1);
    expect(prefs).toEqual(emptyPreferences());
  });
});
