import { describe, expect, it } from "vitest";
import {
  CUISINE_IDS,
  RESTAURANT_TYPE_IDS,
  OCCASION_IDS,
  PRACTICAL_IDS,
  BUDGET_PRESET_IDS,
} from "./discover-preferences";
import { chipIcon } from "./discover-chip-icons";

describe("chipIcon", () => {
  it("returns a non-empty glyph for every discover chip id", () => {
    const ids = [
      ...CUISINE_IDS,
      ...RESTAURANT_TYPE_IDS,
      ...OCCASION_IDS,
      ...PRACTICAL_IDS,
      ...BUDGET_PRESET_IDS,
      "any",
    ];
    for (const id of ids) {
      expect(chipIcon(id).length, id).toBeGreaterThan(0);
    }
  });
});
