# Frontend Task: Onboarding UI Flow Replacement (MetaVerse2D)

## 1) Objective

Replace the current initial browser prompt/alert based onboarding with a fully in-app UI flow layered over the game world background.

The new flow must collect:

1. Player name
2. Avatar selection
3. World selection
4. Room ID + explicit confirmation

This task must remove all onboarding `alert/prompt/confirm` usage and remove Avatar URL as a user-facing option.

---

## 2) Scope

### In Scope

- Design and implement a new onboarding sequence with 4 steps.
- Use animated overlay UI above the map/game background.
- Collect and validate onboarding input.
- Pass final onboarding payload into existing join/start flow.
- Remove legacy pop-up input handling and avatar URL prompt from UI flow.

### Out of Scope

- Backend schema or API changes unrelated to onboarding input format.
- New game worlds content creation (only selection UI for available worlds).

---

## 3) High-Level UX Flow

### Shared Context

- Background: game world map visible behind onboarding UI.
- Main container for steps 1–3: centered floating rectangular panel.
- Title above panel: `Meta Verse 2D`.

### Step 1: Username Entry (split vertical panel)

- Panel split into left and right vertical halves.
- Left half:
  - Title: `Hello User`
  - Text: `Please enter your name`
  - Username input field
- Right half:
  - Text: `Welcome to your 2D world`
- Controls:
  - Primary CTA: `Continue`
- Validation:
  - Required after trim
  - Length: 2 to 20
  - Allowed characters: letters, numbers, spaces, underscore
- If valid: proceed to Step 2.

### Step 2: Avatar Selection (split vertical panel)

- Panel split into left and right vertical halves.
- Left half:
  - Title: `Please select your avatar`
  - Four options: `Avatar 1`, `Avatar 2`, `Avatar 3`, `Avatar 4`
  - Default selected: `Avatar 1`
- Right half:
  - Animated sprite preview of selected avatar
  - Continuous loop of “moving down” animation frames
  - Preview character stays fixed in position (no translation movement)
- Controls:
  - `Back`
  - `Continue`
- If valid: proceed to Step 3.

### Step 3: World Selection (single panel, no split)

- No left/right split.
- Title: `Select your desired world`
- Render world cards with mini world image/preview.
- Hover interaction for each world card:
  - Lift slightly upward (`translateY`) and subtle scale
  - Smooth transition similar to Push-to-Talk hover treatment
- Bottom-right note inside panel:
  - `More worlds to be added soon`
- Controls:
  - `Back`
  - `Continue`
- If world selected: proceed to Step 4.

### Step 4: Room Confirmation Strip (replace panel)

- Remove rectangular panel entirely.
- Show centered horizontal strip/div.
- Entrance animation:
  - Starts from center and spreads left + right
  - Flashy/snappy
  - Duration target: 1.0–1.5 seconds
- Strip content:
  - Prompt for Room ID input
  - Confirmation question: `Are you sure?`
  - Buttons: `Yes` and `No`
- Behavior:
  - `No` keeps strip open for edit.
  - `Yes` finalizes onboarding payload and starts join flow.
- Exit animation:
  - Collapse from both sides into center
  - Disappear at center
  - Snappy, around 1.0–1.5 seconds

---

## 4) Input Space

Collect and hold the following onboarding state:

```ts
type AvatarId = 'avatar1' | 'avatar2' | 'avatar3' | 'avatar4';

interface OnboardingInputState {
  name: string;      // from Step 1
  avatarId: AvatarId; // from Step 2, default avatar1
  worldId: string;   // from Step 3
  roomId: string;    // from Step 4
}
```

### Field Rules

- `name`
  - Trim before validation/submit
  - Required
  - 2–20 chars
  - `[A-Za-z0-9_ ]+`
- `avatarId`
  - Must be one of the 4 known avatar ids
  - Defaults to `avatar1`
- `worldId`
  - Required
  - Must match available world option keys
- `roomId`
  - Trim before validation/submit
  - Required
  - 2–24 chars
  - Alphanumeric + `_` + `-`

---

## 5) Output Space

On successful final confirmation (`Yes` on Step 4), emit/use:

```ts
interface OnboardingOutput {
  name: string;
  avatarId: 'avatar1' | 'avatar2' | 'avatar3' | 'avatar4';
  worldId: string;
  roomId: string;
}
```

Then hand this payload to existing app/game join startup flow.

Do not include avatar URL in output.

---

## 6) Constraints

1. No `window.alert`, `window.prompt`, or `window.confirm` in onboarding flow.
2. Remove avatar URL input option from onboarding UI and related client flow.
3. Keep map/game background visible throughout onboarding.
4. Step transition state must be deterministic and reversible where applicable.
5. Keyboard support:
   - `Enter` advances when current step is valid
   - `Backspace` must not trigger unintended navigation when typing
   - `Escape` may trigger back/close only where safe
6. Mobile + desktop responsive behavior required.
7. Animation performance should prioritize `transform` + `opacity` (avoid layout-heavy animation loops).
8. Avatar preview animation must run continuously and not jitter.
9. Validation errors should be inline UI messages (no popups).
10. Preserve existing game load/start behavior after onboarding completion.

---

## 7) UX/Interaction Requirements

### Visual

- Floating panel should feel layered above map (depth via blur/shadow/glass optional).
- Title `Meta Verse 2D` must be visually tied to panel.
- Step indicators optional but recommended (e.g., `1/4`, `2/4`, etc.).

### Motion

- Step-to-step panel transitions: quick and clean, not slow.
- World card hover: subtle and responsive.
- Step 4 strip animations: centerpiece interaction and must feel “flashy but controlled.”

### Feedback

- Disable `Continue` when step invalid.
- Show selected state clearly for avatar/world.
- Show quick validation hints under problematic fields.

---

## 8) Accessibility Requirements

1. All inputs/buttons have labels.
2. Focus states are visible.
3. Tab order is logical and step-local.
4. Enter key behavior is predictable and safe.
5. Color contrast passes readable UI standards.

---

## 9) Recommended State Model

Use a step state machine with explicit transitions:

```ts
type OnboardingStep = 'name' | 'avatar' | 'world' | 'roomConfirm' | 'complete';
```

Transition rules:

- `name -> avatar` only if `name` valid
- `avatar -> world` always valid with default selection
- `world -> roomConfirm` only if `worldId` selected
- `roomConfirm -> complete` only if `roomId` valid and user confirms `Yes`
- `No` in room confirmation stays in `roomConfirm`
- `Back` supported from steps 2/3 and optionally 4

---

## 10) Legacy Cleanup Requirement

Remove or bypass existing legacy onboarding popups and avatar URL path.

Checklist:

- No username prompt popup path remains active.
- No room confirmation popup path remains active.
- No avatar URL input in onboarding UI path.

---

## 11) Acceptance Criteria

1. On initial load, user sees map background + centered floating panel with title `Meta Verse 2D`.
2. Step 1 renders split panel and validates username before progression.
3. Step 2 renders 4 avatar options with default `Avatar 1` highlighted.
4. Step 2 right panel shows continuous in-place animated sprite preview.
5. Step 3 renders world cards and hover lift animation.
6. Step 3 includes note: `More worlds to be added soon` at bottom-right of panel.
7. Step 4 replaces panel with center horizontal strip with expansion animation.
8. Step 4 supports room ID input and `Are you sure?` with `Yes` / `No`.
9. Step 4 exit animation collapses from both sides to center and disappears.
10. Final output payload contains only `name`, `avatarId`, `worldId`, `roomId`.
11. No alert/prompt/confirm used in onboarding.
12. Avatar URL option is absent from onboarding UI flow.
13. Flow works on desktop and mobile.
14. Keyboard navigation works for form completion.

---

## 12) QA Test List (Manual)

1. Fresh load shows Step 1 and not browser prompt.
2. Enter invalid username and verify inline error.
3. Enter valid username and proceed.
4. Confirm default avatar is Avatar 1.
5. Switch avatars and verify preview changes and animates.
6. Continue to world step and test hover lift.
7. Continue to room strip and observe center-expand animation.
8. Enter invalid room ID and verify inline error.
9. Click `No` and verify strip stays for editing.
10. Click `Yes` with valid room ID and verify onboarding closes via center-collapse.
11. Confirm game joins with selected `name/avatar/world/room`.
12. Confirm no avatar URL prompt appears at any point.

---

## 13) Definition of Done

- All acceptance criteria met.
- Legacy popup flow removed from active path.
- QA list passes.
- No regression in game start/join path.
