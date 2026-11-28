import { describe, expect, it } from "vitest";
import {
  EMPTY_EVENT_DRAFT,
  EVENT_PRESET_IDS,
  EVENT_START_GUESTS,
  apiEventType,
  editDraft,
  firstMissing,
  initialPresetState,
  preferredDateIso,
  selectPreset,
  stepGuests,
} from "./event-presets";

const notes = (id: string) => `notes:${id}`;

describe("banquet presets", () => {
  it("opens on Custom with an empty form", () => {
    const state = initialPresetState();
    expect(state.preset).toBe("custom");
    expect(state.draft).toEqual(EMPTY_EVENT_DRAFT);
    expect(EVENT_PRESET_IDS[0]).toBe("custom");
  });

  it("fills a preset's defaults", () => {
    const state = selectPreset(initialPresetState(), "birthday", notes);
    expect(state.preset).toBe("birthday");
    expect(state.draft).toEqual({ guests: 12, durationMin: 180, time: "19:00", notes: "notes:birthday" });
  });

  it("brings back the guest's own values when Custom is picked again", () => {
    let state = initialPresetState();
    state = editDraft(state, { guests: 30, notes: "Без музыки" });
    state = selectPreset(state, "corporate", notes);
    expect(state.draft.guests).toBe(25);
    state = selectPreset(state, "wedding", notes);
    expect(state.draft.guests).toBe(45);
    state = selectPreset(state, "custom", notes);
    expect(state.preset).toBe("custom");
    expect(state.draft).toEqual({ ...EMPTY_EVENT_DRAFT, guests: 30, notes: "Без музыки" });
  });

  it("keeps Custom empty when the guest never typed anything", () => {
    const state = selectPreset(selectPreset(initialPresetState(), "lunch", notes), "custom", notes);
    expect(state.draft).toEqual(EMPTY_EVENT_DRAFT);
  });

  it("edits made on a preset do not overwrite the remembered Custom values", () => {
    let state = editDraft(initialPresetState(), { guests: 6 });
    state = selectPreset(state, "anniversary", notes);
    state = editDraft(state, { guests: 9 });
    expect(state.draft.guests).toBe(9);
    expect(state.custom.guests).toBe(6);
    expect(selectPreset(state, "custom", notes).draft.guests).toBe(6);
  });

  it("picking the selected preset again changes nothing", () => {
    const state = selectPreset(initialPresetState(), "birthday", notes);
    expect(selectPreset(state, "birthday", notes)).toBe(state);
  });

  it("maps presets to event types the API accepts", () => {
    expect(apiEventType("custom")).toBe("other");
    expect(apiEventType("wedding")).toBe("banquet");
    expect(apiEventType("anniversary")).toBe("romantic");
  });
});

describe("banquet form helpers", () => {
  it("starts the empty guest stepper from a sensible count and clamps", () => {
    expect(stepGuests(null, 1)).toBe(EVENT_START_GUESTS);
    expect(stepGuests(null, -1)).toBe(EVENT_START_GUESTS);
    expect(stepGuests(4, -1)).toBe(4);
    expect(stepGuests(120, 1)).toBe(120);
    expect(stepGuests(12, 1)).toBe(13);
  });

  it("builds the preferred date from a local day and a time chip", () => {
    const iso = preferredDateIso(new Date(2026, 11, 5), "19:00");
    expect(iso).not.toBeNull();
    const at = new Date(iso!);
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 11, 5, 19, 0]);
    expect(preferredDateIso(null, "19:00")).toBeNull();
    expect(preferredDateIso(new Date(), null)).toBeNull();
  });

  it("names the first missing field", () => {
    const filled = { day: new Date(), time: "19:00", guests: 12, name: "Ana", phone: "+373" };
    expect(firstMissing(filled)).toBeNull();
    expect(firstMissing({ ...filled, guests: null })).toBe("guests");
    expect(firstMissing({ ...filled, day: null })).toBe("date");
    expect(firstMissing({ ...filled, time: null })).toBe("time");
    expect(firstMissing({ ...filled, name: " " })).toBe("name");
    expect(firstMissing({ ...filled, phone: "" })).toBe("phone");
  });
});
