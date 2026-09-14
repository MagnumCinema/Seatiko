# Discover preference box polish (hybrid soft auto-advance)

Date: 2026-09-14  
Status: approved for implementation after user review of this spec

## Goal

Make the `/discover` preference stepper box more attractive and comfortable to use by improving:

1. Step progress (numbered rail)
2. Chip look and selected state
3. Box chrome / hierarchy / motion
4. Step navigation (Back / Continue + soft auto-advance)

Keep the existing hybrid model (stepper + optional Ask for help) and preference data model unchanged.

## Decisions (from brainstorming)

| Topic | Choice |
|---|---|
| Focus | Preference box + chips (not chat rewrite / not map filters redesign) |
| Change size | Hybrid — keep one-step-at-a-time, enrich progress + chips |
| Interaction | Soft auto-advance (Approach A) |
| Step status | Plain text in footer — never inside Back/Continue buttons |
| Chat / map filters / summary | Out of scope except light spacing alignment |

## Non-goals

- Guided chat script rewrite or LLM integration
- Changes to `DiscoverPreferences`, encode/decode, or map filter/rank logic
- Redesign of Active filters bar or sticky Preference summary (tiny CSS consistency OK)
- Flutter / Android parity

## UX design

### Layout

- Horizontal **numbered progress rail** at the top of `.discover-stepper`
  - Completed steps: muted + check affordance
  - Current step: emphasized
  - Future steps: muted
  - Clicking any step jumps to that index (existing behaviour, clearer affordance)
- Under the rail: step **title** + short **hint** (dimension-specific or shared “pick any / multi-select OK”)
- Chip area
- Footer: **Back** (button) · **plain-text status** · **Continue** (button)
  - Status example: `Step 2 of 5 · 1 selected`
  - Optional while timer runs: `Continuing…` appended/near status (still plain text)

Ask-for-help stays beside the box on desktop; stacks below on mobile. Only adjust spacing if the taller box crowds the chat.

### Chips

- Larger tap targets (more padding / min-height)
- Clearer selected state (stronger fill/border + check or equivalent)
- Light press feedback (scale/opacity)
- Theme-aware (`--fa-*` / `--site-*`); no hardcoded dark-only surfaces for the box

### Soft auto-advance

1. On **select** (chip becomes selected), start an **800ms** timer.
2. Any further select/deselect on the step **resets** the timer.
3. When the timer fires:
   - If the step has **≥ 1** selected value → advance to next step
   - If **0** selected → do nothing
4. Deselecting to zero **cancels** pending auto-advance (clear the timer; do not advance).
5. **Continue** advances immediately; with zero picks it skips the dimension (empty constraint).
6. **Back** is manual only; never auto-triggered.
7. **Last step** never soft-auto-advances (user uses Continue / summary CTAs).

Multi-select remains supported on every dimension.

## Technical notes

- Primary touchpoints: `preference-stepper.tsx`, discover stepper CSS in `premium.css`, copy in `site-copy.ts` (+ messages if used).
- Extract auto-advance scheduling rules into a small pure helper (or hook) so behaviour is unit-tested without timers flaking in the component.
- Preserve existing `DiscoverPreferences` toggle APIs (`toggleId`, etc.).

## i18n

Add only strings needed for the new UI, in RU / EN / RO via existing `getSiteCopy(locale).discover`:

- Step status pattern (`Step {n} of {total}`, selected count)
- Optional `Continuing…`
- Per-step or shared short hints if not already covered

## Verification

- Unit tests: schedule / reset / cancel / no advance on last step / advance only when ≥1 selected
- Manual: light/dark theme; keyboard focus on chips and rail; multi-select then Continue; mobile stack; Ask-for-help still usable

## Out of product scope reminder

This does not change the earlier discover wizard product goal (prefs → map). It only improves the stepper surface and advance behaviour on `/discover`.
