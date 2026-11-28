/**
 * Banquet form presets. "Свой вариант / Custom" is selected when the form opens and
 * the form is empty. Picking a preset fills its defaults; picking Custom again brings
 * back exactly what the guest had typed while on Custom.
 */

export type EventPresetId = "custom" | "birthday" | "corporate" | "wedding" | "anniversary" | "lunch";

/** Fields a preset fills. Date and contacts are always the guest's own. */
export type EventDraft = {
  guests: number | null;
  durationMin: number | null;
  /** Start time "HH:MM". */
  time: string | null;
  notes: string;
};

export type EventPreset = {
  id: Exclude<EventPresetId, "custom">;
  /** event_type the API knows today (BACKEND_TASKS №64 adds wedding / anniversary / business_lunch). */
  apiType: "birthday" | "banquet" | "corporate" | "romantic" | "other";
  guests: number;
  durationMin: number;
  time: string;
};

export const EVENT_PRESETS: readonly EventPreset[] = [
  { id: "birthday", apiType: "birthday", guests: 12, durationMin: 180, time: "19:00" },
  { id: "corporate", apiType: "corporate", guests: 25, durationMin: 240, time: "18:00" },
  { id: "wedding", apiType: "banquet", guests: 45, durationMin: 300, time: "16:00" },
  { id: "anniversary", apiType: "romantic", guests: 8, durationMin: 180, time: "19:00" },
  { id: "lunch", apiType: "corporate", guests: 10, durationMin: 90, time: "13:00" },
];

export const EVENT_PRESET_IDS: readonly EventPresetId[] = ["custom", ...EVENT_PRESETS.map((p) => p.id)];

export const EVENT_DURATIONS_MIN = [90, 180, 240, 300] as const;
export const EVENT_TIMES = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"] as const;
export const EVENT_MIN_GUESTS = 4;
export const EVENT_MAX_GUESTS = 120;
/** Guest count a first tap on − / + starts from when the field is empty. */
export const EVENT_START_GUESTS = 10;

export const EMPTY_EVENT_DRAFT: EventDraft = { guests: null, durationMin: null, time: null, notes: "" };

export type PresetState = {
  preset: EventPresetId;
  /** What the form shows. */
  draft: EventDraft;
  /** The guest's own values from Custom, restored when Custom is picked again. */
  custom: EventDraft;
};

export function initialPresetState(): PresetState {
  return { preset: "custom", draft: EMPTY_EVENT_DRAFT, custom: EMPTY_EVENT_DRAFT };
}

export function findPreset(id: EventPresetId): EventPreset | undefined {
  return EVENT_PRESETS.find((preset) => preset.id === id);
}

/** The defaults of a preset; `notesFor` gives its suggested wishes in the guest's language. */
export function presetDraft(id: EventPresetId, notesFor: (id: EventPreset["id"]) => string): EventDraft {
  const preset = findPreset(id);
  if (!preset) return EMPTY_EVENT_DRAFT;
  return { guests: preset.guests, durationMin: preset.durationMin, time: preset.time, notes: notesFor(preset.id) };
}

export function selectPreset(
  state: PresetState,
  id: EventPresetId,
  notesFor: (id: EventPreset["id"]) => string,
): PresetState {
  if (id === state.preset) return state;
  // Leaving Custom: keep what the guest typed so Custom can bring it back.
  const custom = state.preset === "custom" ? state.draft : state.custom;
  if (id === "custom") return { preset: "custom", draft: custom, custom };
  return { preset: id, draft: presetDraft(id, notesFor), custom };
}

/** A field edit: on Custom it also becomes the remembered Custom value. */
export function editDraft(state: PresetState, patch: Partial<EventDraft>): PresetState {
  const draft = { ...state.draft, ...patch };
  return { ...state, draft, custom: state.preset === "custom" ? draft : state.custom };
}

export function clampGuests(value: number): number {
  return Math.max(EVENT_MIN_GUESTS, Math.min(EVENT_MAX_GUESTS, Math.round(value)));
}

/** − / + on the guests stepper; an empty field starts from EVENT_START_GUESTS. */
export function stepGuests(current: number | null, delta: 1 | -1): number {
  if (current == null) return EVENT_START_GUESTS;
  return clampGuests(current + delta);
}

export function apiEventType(id: EventPresetId): EventPreset["apiType"] {
  return findPreset(id)?.apiType ?? "other";
}

/** Local date + "HH:MM" → ISO for preferred_date; null when either is missing. */
export function preferredDateIso(day: Date | null, time: string | null): string | null {
  if (!day || !time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(match[1]), Number(match[2]));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export type EventFormError = "date" | "time" | "guests" | "name" | "phone";

/** First missing field, in the order the form shows them. */
export function firstMissing(input: {
  day: Date | null;
  time: string | null;
  guests: number | null;
  name: string;
  phone: string;
}): EventFormError | null {
  if (input.guests == null || input.guests < EVENT_MIN_GUESTS) return "guests";
  if (!input.day) return "date";
  if (!input.time) return "time";
  if (!input.name.trim()) return "name";
  if (!input.phone.trim()) return "phone";
  return null;
}
