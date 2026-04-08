# MetaVerse2D — Code Quality Improvement Plan

> **Golden Rule for every phase:** No logic change unless explicitly noted. Core functionality, networking, game engine behavior, auth flow, and real-time multiplayer MUST work identically after every phase. Each phase ends with a QA smoke-test checklist before moving to the next.

---

## Guiding Principles

| Principle | What it means in this codebase |
|---|---|
| **SOLID** | Single Responsibility per file/class, Open for extension (new avatars, worlds), Closed to modification, Dependency Inversion via interfaces |
| **KISS** | Keep complex logic (interpolation, collision) in dedicated single-purpose files; avoid clever one-liners that obscure intent |
| **DRY** | Eliminate the 5+ duplicated copies of `getSpriteSheetMetrics`, `buildSpriteFrameStyle`, `normalizeAvatarUrl`, and `numberToHexColor` |
| **SSOT** | One canonical location for every type, every constant, and every validation rule |
| **Loose Coupling** | `GameCanvas` should not know about socket internals; components should only talk to stores, not to each other |

---

## Pre-Requisites (Do These First — In Order)

These are foundational tasks that MUST be complete before any phase begins. They do not change logic; they only set up the safety net.

### PR-1: Establish a Baseline Snapshot

Before touching any code, manually verify and document the current working state.

**Checklist:**
- [ ] Open browser at `http://localhost:3000`, complete the full onboarding flow (login, avatar select, world select, room confirm), and confirm you land in the game world
- [ ] Open a second browser tab, join the same world + room, verify both players are visible to each other
- [ ] Cycle mic modes (`M` key), verify `MicModeCircle` icon changes (muted / push-to-talk / always-on)
- [ ] Move the player around, verify position syncs to the second tab with no rubber-banding
- [ ] On mobile (or browser devtools mobile mode), verify touch joystick appears and the `RotateDeviceOverlay` fires in portrait
- [ ] Disconnect and reconnect; verify the player re-spawns near their last position
- [ ] Screenshot or record this baseline so regressions are immediately visible during later phases

### PR-2: Align TypeScript Strict Mode

The monorepo has different tsconfig settings per package. Align them all before refactoring so type errors surface during the improvement work rather than after.

**Files to check:** `apps/web/tsconfig.json`, `apps/server/tsconfig.json`, `packages/shared/tsconfig.json`, `tsconfig.base.json`

**What to do:**
- [ ] Confirm `"strict": true` is present in `tsconfig.base.json`
- [ ] Confirm all workspace tsconfigs extend the base
- [ ] Run `npm run typecheck --workspaces` and fix any pre-existing errors — these are not new errors, they are existing hidden bugs

### PR-3: Document Existing Module Contracts

Before reorganizing, write a one-line JSDoc `@module` comment at the top of every file in `apps/server/src/` and `apps/web/network/`. This creates an audit trail and forces you to understand each file's purpose before moving it.

---

## Phase 1 — Extract Shared Utilities & Kill Duplication (DRY / SSOT)

**Goal:** Eliminate every copy-pasted function across the codebase. Zero logic changes; extract and re-import only.

**Time Estimate:** 1–2 days

### 1.1 — Create `apps/web/lib/spriteUtils.ts`

**Problem:** `getSpriteSheetMetrics`, `buildSpriteFrameStyle`, `SpriteSheetMetrics` type are copy-pasted with slight variations in:
- `components/OnboardingOverlay.tsx` (preview scale = 7, no `height` in metrics)
- `components/TopRightStatusCluster.tsx` (preview scale = 1.5, has `height` in metrics)

Both functions are identical in intent. The only difference is the `scale` parameter and whether `height` is tracked. This is a classic DRY violation.

**Action:**
- Create `apps/web/lib/spriteUtils.ts`
- Export a unified `SpriteSheetMetrics` type (include `height`)
- Export a single `loadSpriteSheetMetrics(): Promise<SpriteSheetMetrics>` (module-level cached promise, same pattern as now)
- Export a single `buildSpriteFrameStyle(frameIndex, metrics, scale): CSSProperties`
- Delete the private copies in both component files and import from `spriteUtils.ts`

**Files changed:** `OnboardingOverlay.tsx`, `TopRightStatusCluster.tsx`, new `lib/spriteUtils.ts`

### 1.2 — Create `apps/web/lib/colorUtils.ts`

**Problem:** `numberToHexColor` is copy-pasted in:
- `components/TopRightStatusCluster.tsx`
- `components/BottomAvatarCircle.tsx`

**Action:**
- Create `apps/web/lib/colorUtils.ts` with `export function numberToHexColor(color: number): string`
- Delete the private copies, import from `colorUtils.ts`

**Files changed:** `TopRightStatusCluster.tsx`, `BottomAvatarCircle.tsx`, new `lib/colorUtils.ts`

### 1.3 — Consolidate `normalizeAvatarUrl` (Server)

**Problem:** `normalizeAvatarUrl` (URL validation: http/https only) is copy-pasted in:
- `apps/server/src/socket/handlers.ts`
- `apps/server/src/core/persistenceRoutes.ts`

**Action:**
- Move `normalizeAvatarUrl` into `apps/server/src/domain/avatarUtils.ts` (new file)
- Import it in both `handlers.ts` and `persistenceRoutes.ts`

**Files changed:** `handlers.ts`, `persistenceRoutes.ts`, new `domain/avatarUtils.ts`

### 1.4 — Consolidate Validation Wrappers (Client)

**Problem:** `OnboardingOverlay.tsx` wraps shared validation functions (`validateName`, `validateEmail`, `validateRoomId`) in local private wrapper functions. The `validatePassword` and `isAuthPotentiallyValid` logic also lives entirely inside the component.

**Action:**
- Create `apps/web/lib/onboardingValidation.ts`
- Move `validatePassword`, `getInlineEmailError`, `getInlinePasswordError`, `getInlineUsernameError`, `isAuthPotentiallyValid`, `isRoomPotentiallyValid`, `validateRoomId`, `deriveDisplayNameFromEmail`, `formatDisplayNameValidationMessage` into this file
- `OnboardingOverlay.tsx` imports these functions — no logic changes

**Files changed:** `OnboardingOverlay.tsx`, new `lib/onboardingValidation.ts`

### Phase 1 QA Checklist
- [ ] Run `npm run typecheck --workspaces` — zero errors
- [ ] Run the full onboarding flow end-to-end — it works identically
- [ ] Verify avatar sprite previews animate correctly in onboarding (Step 2) and in `TopRightStatusCluster`
- [ ] Verify `numberToHexColor` color circle renders correctly when no avatarUrl is set

---

## Phase 2 — Build a Primitive UI Component Library (Reusability / KISS)

**Goal:** Extract raw HTML elements that are repeated with only class differences into typed, focused React components. No behavioral logic is added; only presentation wrappers are created.

**Time Estimate:** 2–3 days

**New directory:** `apps/web/components/ui/`

This directory holds "headless-ready" primitives: they accept `children`, optional `variant`/`size` props, and forward any standard HTML attributes. They do NOT import from stores, game code, or network code.

### 2.1 — `ui/Button.tsx`

**Problem:** Across `OnboardingOverlay.tsx` and `VoiceControls.tsx`, there are 12+ `<button>` elements each with 100–200 character inline className strings. Patterns:
- **Primary CTA** (cyan gradient, full width on mobile): "Continue", "Sign Up / Login"
- **Secondary/Ghost** (white border, transparent bg): "Back", "Sign Out"
- **Danger/Confirm** (orange gradient): "Yes" room confirm button
- **Dismiss** (zinc dark): "No" room confirm button
- **Toggle** (selected = cyan filled, unselected = transparent border): auth mode toggle, avatar selector buttons
- **Pressed/Active** (emerald bg): voice mode selected, push-to-talk active

**Action:**
```typescript
// apps/web/components/ui/Button.tsx
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dismiss' | 'toggle' | 'active';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  selected?: boolean; // for toggle variant
  fullWidthOnMobile?: boolean;
}
```

Map each variant to the correct Tailwind class string. The `selected` prop is for the toggle pattern (auth mode tab, avatar selector). All existing inline classNames are simply replaced with the appropriate `<Button variant="primary">` etc.

### 2.2 — `ui/TextInput.tsx`

**Problem:** Same styled `<input>` appears 5 times in `OnboardingOverlay.tsx` (email, password, display name, room ID) with identical border/focus/bg/ring classes and only `type`, `placeholder`, `autoComplete`, `maxLength` varying.

**Action:**
```typescript
// apps/web/components/ui/TextInput.tsx
interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string | null; // renders inline error below input if provided
}
```

The `error` prop renders a `<div className="min-h-6 pt-1 text-sm text-rose-300">` below the field, collapsing the repeated error `div` pattern too.

### 2.3 — `ui/FormLabel.tsx`

**Problem:** The `<label>` with `uppercase tracking-widest text-zinc-200` appears 4 times in `OnboardingOverlay.tsx`.

**Action:** Simple wrapper that accepts `htmlFor` and `children`. One line of logic.

### 2.4 — `ui/PanelSection.tsx`

**Problem:** The split left/right panel grid pattern (`grid grid-cols-1 md:grid-cols-2`, `border-b border-white/15 p-5 md:border-b-0 md:border-r`) appears in Step 1 (name/auth) and Step 2 (avatar) of the onboarding flow.

**Action:**
```typescript
// apps/web/components/ui/PanelSection.tsx
// Renders a two-column responsive split section for left + right halves.
interface PanelSectionProps {
  left: React.ReactNode;
  right: React.ReactNode;
}
```

### 2.5 — `ui/HudCircle.tsx`

**Problem:** The "glassmorphism circle HUD element" (rounded-full, border-white/15, bg-black/40, backdrop-blur) is used in:
- `TopRightStatusCluster.tsx` as `CircleShell` (local private component)
- `MicModeCircle.tsx` as inline div
- `BottomAvatarCircle.tsx` as inline div

All three have marginally different sizes controlled by `touchOptimized`. These should share one component.

**Action:**
```typescript
// apps/web/components/ui/HudCircle.tsx
interface HudCircleProps {
  size?: 'sm' | 'md' | 'lg'; // maps to h-11/w-11, h-12/w-12, h-14/w-14
  children: React.ReactNode;
  ariaLabel?: string;
}
```

Delete the local `CircleShell` in `TopRightStatusCluster.tsx`. Update `MicModeCircle.tsx` and `BottomAvatarCircle.tsx` to use `HudCircle`.

### 2.6 — `ui/InlineMessage.tsx`

**Problem:** `<div className="min-h-6 pt-1 text-sm text-rose-300">` (error), `<div className="min-h-6 pt-1 text-sm text-zinc-300/85">` (hint), and similar `<p>` variants are repeated throughout `OnboardingOverlay.tsx` (10+ occurrences).

**Action:**
```typescript
// apps/web/components/ui/InlineMessage.tsx
interface InlineMessageProps {
  type: 'error' | 'hint' | 'success' | 'warning';
  children: React.ReactNode;
  className?: string;
}
```

### Phase 2 QA Checklist
- [ ] All onboarding steps render visually identically to baseline screenshot
- [ ] Button hover/focus states work correctly (keyboard tab navigation)
- [ ] All form inputs accept input without regression (email, password, name, room ID)
- [ ] `Enter` key advances steps as before
- [ ] `HudCircle` renders correctly in top-right cluster and `MicModeCircle`
- [ ] `touchOptimized` sizing still applies correctly on mobile viewport

---

## Phase 3 — Decompose Monolithic Components (SRP / SOLID)

**Goal:** Break files that violate the Single Responsibility Principle into smaller, focused units. `OnboardingOverlay.tsx` at 1166 lines and `GameCanvas.tsx` at 568 lines are the primary targets.

**Time Estimate:** 3–4 days

### 3.1 — Decompose `OnboardingOverlay.tsx`

**Current problem:** One 1166-line file owns:
1. Auth form state (email, password, availability checking, debounce)
2. Onboarding step state machine (name → avatar → world → roomConfirm)
3. Sprite sheet animation preview
4. All JSX for all 4 steps
5. Validation helpers (already extracted in Phase 1)
6. World options configuration (data mixed with component)

**Target directory:** `apps/web/components/onboarding/`

**New structure:**
```
components/onboarding/
  OnboardingOverlay.tsx       ← Thin orchestrator only. Step router + shared state.
  steps/
    NameAuthStep.tsx           ← Step 1: Email/password/display name auth form
    AvatarStep.tsx             ← Step 2: Avatar selection + animated preview
    WorldStep.tsx              ← Step 3: World card selection grid
    RoomConfirmStep.tsx        ← Step 4: Room ID input + Yes/No strip
  AvatarSpritePreview.tsx      ← Extracted from OnboardingOverlay (avatar animation)
  onboardingTypes.ts           ← OnboardingDraft, OnboardingStep, AuthMode types
  worldOptions.ts              ← WORLD_OPTIONS constant (data only, no JSX)
```

**Rules for decomposition:**
- `OnboardingOverlay.tsx` (orchestrator) holds shared state: `step`, `nameValue`, `avatarId`, `worldId`, `roomId`, `isClosingRoomStrip`, `authSession`
- Each step component receives only the props it needs via explicit interface; it does NOT reach up to parent state directly
- Steps emit events upward: `onContinue(value)`, `onBack()`
- Auth-specific state (`emailValue`, `passwordValue`, emailAvailability debounce, `isAuthSubmitting`, `authError`) lives inside `NameAuthStep.tsx` only — it is the sole consumer

### 3.2 — Decompose `GameCanvas.tsx`

**Current problem:** `GameCanvas.tsx` at 568 lines is the "god component". It owns:
1. Onboarding session read/write (localStorage serialization)
2. Phaser game engine lifecycle (boot, destroy, resize)
3. Socket + WebRTC lifecycle (connect, reconnect, disconnect)
4. Players:update event listener that feeds minimap + room population
5. Layout decisions (desktop vs. touch, portrait lock)
6. Crossfade animation state (backdrop → real map)
7. HUD rendering

**Target:** Extract responsibilities into focused hooks and keep `GameCanvas.tsx` as a thin assembler.

**New files:**
```
apps/web/hooks/
  useOnboardingSession.ts    ← sessionStorage read/write, draft state
  usePhaserGame.ts           ← game init, destroy, resize observer
  useSocketLifecycle.ts      ← connect/disconnect, players:update listener, HUD state updates
  useBackdropHandoff.ts      ← crossfade state machine (SCREENSHOT_VISIBLE → REAL_MAP_VISIBLE)
```

**Rules:**
- Each hook has a single `return` shape typed explicitly
- `useSocketLifecycle` takes `joinIdentity` and `isGameReady` as dependencies — same logic, same deps array as the existing `useEffect`
- `GameCanvas.tsx` becomes ~100 lines: imports hooks, assembles JSX

### 3.3 — Split `apps/server/src/socket/handlers.ts`

**Current problem:** `handlers.ts` at 459 lines owns:
1. Type definitions for all socket payloads
2. Module-level mutable state (`playerManager`, `proximitySystem`, `playerPersistenceService`, `socketPersistenceUserIds`, `scopeSnapshotSeq`, `socketLastProcessedInputSeq`, `gameTickTimer`)
3. `registerSocketHandlers` — event wiring
4. `handleJoin` — join business logic (persist, spawn, join room)
5. `startGameTick` — game loop
6. Many private normalizer/helper functions

**Target directory:** `apps/server/src/socket/`

**New structure:**
```
socket/
  index.ts                 ← (existing) attachSocketServer
  handlers.ts              ← Only registerSocketHandlers + startGameTick (wiring only)
  joinHandler.ts           ← handleJoin extracted as standalone async function
  sessionState.ts          ← Module-level Maps (socketPersistenceUserIds, scopeSnapshotSeq, socketLastProcessedInputSeq) with typed accessor functions
  payloadTypes.ts          ← All socket payload types (MovePayload, JoinPayload, PlayersUpdatePayload, etc.)
  normalizers.ts           ← normalizeWorldId, normalizeRoomId, normalizeAvatarId, normalizeAvatarUrl (server-side), normalizeAvatarUrl merged with Phase 1.3 avatarUtils
```

### Phase 3 QA Checklist
- [ ] Full end-to-end game session: onboard → join → move → see remote players
- [ ] Step navigation in onboarding: forward (Continue) and backward (Back) for all 4 steps
- [ ] Auth: login with existing account, sign up with new account, "Continue Saved Session" flow
- [ ] Email availability debounce: type an email and wait, verify debounce fires once
- [ ] Socket reconnection: kill and restart `npm run dev:server`, verify client auto-reconnects
- [ ] Game tick continues after reconnect (remote players still update)
- [ ] `handleJoin` still loads persisted spawn position on reconnect

---

## Phase 4 — Harden State Management (SSOT / Loose Coupling)

**Goal:** Every piece of UI state has exactly one owner and one write path. Components read from stores; they never own shared state in React local state.

**Time Estimate:** 2 days

### 4.1 — Create a Typed Observable Store Factory

**Problem:** `runtimeUiStore.ts` and `chatUiStore.ts` both implement the exact same observable pattern:

```typescript
let state = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();
export function subscribe(listener) { ... }
export function getState() { ... }
function emit() { ... }
```

This pattern is DRY-violated. Adding a third store means copy-pasting it again.

**Action:**
- Create `apps/web/lib/createObservableStore.ts`
- Export a factory:
  ```typescript
  export function createObservableStore<T>(defaultState: T): {
    getState: () => T;
    setState: (updater: (prev: T) => T) => void;
    subscribe: (listener: () => void) => () => void;
    reset: () => void;
  }
  ```
- Rewrite `runtimeUiStore.ts` and `chatUiStore.ts` as thin wrappers that call this factory and export named setters (e.g., `setJoinUiPhase`, `appendRoomChatMessage`) as before — the public API stays identical, nothing in the app changes

### 4.2 — Unify `voiceControlStore.ts` Pattern

**Problem:** `game/systems/voiceControlStore.ts` independently implements a third copy of the same observable store pattern but is located in the game layer instead of `lib/`.

**Action:**
- Move `voiceControlStore.ts` to `apps/web/lib/voiceControlStore.ts` (it has no Phaser dependencies; it is pure TypeScript state)
- Update imports in `MicModeCircle.tsx`, `VoiceControls.tsx`, `VoiceKeyboardBindings.tsx`, `ProximityVoiceSystem.ts`
- Rewrite internals to use `createObservableStore` factory

**Why this matters:** The game README says "Networking is NOT allowed in this layer" and "Authentication is NOT allowed in this layer." `voiceControlStore` is not a game concept — it is UI state that happens to be consumed by a game system.

### 4.3 — Validate the Single Source of Truth for Player Identity State

**Problem:** Player identity (name, worldId, roomId, avatarId) is stored in THREE places simultaneously:
1. `sessionStorage` (via `readOnboardingDraftFromSession` / `persistOnboardingDraftToSession`)
2. The socket client module (`apps/web/network/socket/socketClient.ts` via `setPlayerName`, `setWorldId`, etc.)
3. The `runtimeUiStore` (via `setRuntimeIdentity`)

This is not a bug — each store serves a different purpose (persistence, network emit, HUD display). But the write sequence in `GameCanvas.tsx` is ad-hoc and repeated.

**Action:**
- Create `apps/web/lib/playerIdentityBridge.ts`
- Export one function: `applyJoinIdentity(draft: OnboardingDraft): void`
- This function encapsulates the 6 sequential setter calls currently scattered in `GameCanvas.tsx`:
  ```typescript
  setRuntimeAvatar(null, 0x3b82f6, requestedAvatarId);
  setRuntimeIdentity(requestedName, requestedRoomId);
  setPlayerName(requestedName);
  setWorldId(requestedWorldId);
  setRoomId(requestedRoomId);
  setPlayerAvatarId(requestedAvatarId);
  setPlayerAvatarUrl(null);
  ```
- SSOT means: one function, one call site, one place to update if identity fields change

### Phase 4 QA Checklist
- [ ] `createObservableStore` unit test: subscribe, setState, verify listener fires, verify getState returns new value, unsubscribe, verify listener does not fire
- [ ] Room population counter in top-right HUD updates correctly when a second player joins
- [ ] Mic mode icon changes correctly when `M` is pressed
- [ ] Chat messages appear correctly in the chat overlay (if chat UI is visible)
- [ ] On page refresh, sessionStorage is read and pre-populates onboarding fields correctly

---

## Phase 5 — Directory Structure Finalization (Scalability / Discoverability)

**Goal:** Make the directory structure self-documenting. A new developer should be able to find any file within 15 seconds.

**Time Estimate:** 1 day

### Proposed Final Structure — `apps/web/`
```
apps/web/
  app/                          ← Next.js App Router (untouched)
    layout.tsx
    page.tsx
    globals.css
    api/
  components/
    ui/                         ← NEW: Primitive, reusable, store-ignorant components
      Button.tsx
      TextInput.tsx
      FormLabel.tsx
      PanelSection.tsx
      HudCircle.tsx
      InlineMessage.tsx
      index.ts                  ← barrel export
    onboarding/                 ← NEW: Onboarding wizard components
      OnboardingOverlay.tsx     ← Thin orchestrator
      AvatarSpritePreview.tsx
      onboardingTypes.ts
      worldOptions.ts
      steps/
        NameAuthStep.tsx
        AvatarStep.tsx
        WorldStep.tsx
        RoomConfirmStep.tsx
    hud/                        ← NEW: In-game HUD overlay components
      TopRightStatusCluster.tsx
      JoinStatusOverlay.tsx
      MicModeCircle.tsx
      BottomAvatarCircle.tsx
      CircularMinimap.tsx
      VoiceControls.tsx
    GameCanvas.tsx               ← Kept at top-level (it is the root orchestrator)
    JoinStatusOverlay.tsx        ← (moved to hud/)
    RotateDeviceOverlay.tsx
    TouchGameplayControls.tsx
    VoiceKeyboardBindings.tsx
  config/
    features.ts                  ← (unchanged)
  game/
    config/
    core/
    entities/
    scenes/
    systems/
    utils/
    index.ts
    playerController.ts
  hooks/                         ← NEW: Custom React hooks extracted from GameCanvas
    useOnboardingSession.ts
    usePhaserGame.ts
    useSocketLifecycle.ts
    useBackdropHandoff.ts
  lib/
    createObservableStore.ts     ← NEW: Store factory
    colorUtils.ts                ← NEW: numberToHexColor
    spriteUtils.ts               ← NEW: loadSpriteSheetMetrics, buildSpriteFrameStyle
    onboardingValidation.ts      ← NEW: all validation helpers
    playerIdentityBridge.ts      ← NEW: applyJoinIdentity
    runtimeUiStore.ts            ← Refactored (uses factory)
    chatUiStore.ts               ← Refactored (uses factory)
    voiceControlStore.ts         ← MOVED here from game/systems/
    useGameplayViewport.ts
    gameplayViewportConfig.ts
  network/
    auth/
    rtc/
    socket/
    index.ts
    movementSync.ts
  store/
    useInputStore.ts             ← (unchanged, Zustand is appropriate here)
  types/
  hooks/ (already above)
  public/
```

### Proposed Final Structure — `apps/server/src/`
```
apps/server/src/
  auth/
    supabaseAuth.ts
  core/
    loadEnvironment.ts
    origin.ts
    persistenceRoutes.ts
    server.ts
  db/
  domain/
    avatarUtils.ts               ← NEW (from Phase 1.3)
    playerManager.ts
    proximitySystem.ts
    roomManager.ts
    spawnSystem.ts
    staticCollisionMap.ts
    worldConfig.ts
  services/
    playerPersistenceService.ts
  socket/
    handlers.ts                  ← Slimmed (Phase 3.3)
    index.ts
    joinHandler.ts               ← NEW (extracted from handlers)
    normalizers.ts               ← NEW (all normalize* functions)
    payloadTypes.ts              ← NEW (all socket payload types)
    sessionState.ts              ← NEW (module-level Maps + accessors)
  scripts/
  index.ts
```

### 5.1 — Update All Path Aliases

After moving files, update all `@/...` import paths. Next.js path aliases in `tsconfig.json` should remain `@/` → `apps/web/`.

**Action:** Run `npm run typecheck` and fix every import error.

### Phase 5 QA Checklist
- [ ] `npm run typecheck --workspaces` passes with zero errors
- [ ] `npm run dev:web` and `npm run dev:server` both start without errors
- [ ] Complete end-to-end test: onboard → join → move → voice cycle → disconnect → reconnect
- [ ] No `console.error` or `console.warn` from missing modules or broken imports

---

## Phase 6 — Final QA Pass (as a QA Engineer)

Do this phase as if you are a QA engineer who has never seen the codebase.

### 6.1 — Functional Regression Tests

Test every user-facing feature:

| Feature | Test | Expected |
|---|---|---|
| Fresh load | Open `localhost:3000` in incognito | Step 1 (auth) appears. Game world is visible in background |
| Sign up | Enter new email + password + display name | Proceeds to Step 2 |
| Login | Enter existing credentials | Proceeds to Step 2 |
| Continue saved session | Browser has existing JWT | "Continue Saved Session" button appears, advances directly |
| Sign out | Click Sign Out | Session cleared, form resets |
| Avatar selection | Click each avatar | Preview sprite animates the correct character |
| World selection | Click World 1 card | "Selected" badge appears, hover lift animation works |
| Room entry (invalid) | Enter `@!#` as room ID | Inline error shown, "Yes" button disabled |
| Room entry (valid) | Enter `room-01` | Strip closes with animation, game boots |
| Back navigation | Click Back from avatars, world, room | Returns to correct previous step |
| Keyboard Enter | Press Enter on email/password field | Advances form |
| Keyboard Escape | Press Escape on avatar/world steps | Goes back |
| Remote player appears | Open two tabs, same world+room | Both see each other's sprites |
| Player movement sync | Move in tab 1 | Tab 2 sees interpolated movement |
| Mic mode cycle | Press M three times | Icon cycles: muted → push-to-talk → always-on → muted |
| Push-to-talk | Hold Space | Mic mode circle lifts upward |
| Reconnect | Restart server | Client reconnects, game state restored |
| Mobile layout | Set viewport to 375px width | Joystick appears, touch controls work |
| Portrait lock | Rotate to portrait on mobile | Rotate device overlay appears |

### 6.2 — Code Quality Validation

- [ ] Search for `getSpriteSheetMetrics` — should appear in only ONE file (`lib/spriteUtils.ts`)
- [ ] Search for `numberToHexColor` — should appear in only ONE file (`lib/colorUtils.ts`)
- [ ] Search for `normalizeAvatarUrl` (server-side) — should appear in only ONE file
- [ ] Search for `const listeners = new Set` — should appear in only ONE file (`lib/createObservableStore.ts`)
- [ ] `OnboardingOverlay.tsx` line count should be under 200 lines
- [ ] `GameCanvas.tsx` line count should be under 150 lines
- [ ] `socket/handlers.ts` line count should be under 150 lines
- [ ] Every file in `components/ui/` has zero imports from `@/network`, `@/game`, or `@/lib/*Store`
- [ ] Every file in `game/` has zero imports from `socket.io-client` or `@supabase/supabase-js`

### 6.3 — Performance Sanity Check

- [ ] Open Chrome DevTools → Performance tab, record 10 seconds of player movement
- [ ] Verify no excessive React re-renders (look for layout thrash or forced reflows)
- [ ] Verify `.ui-flow-box` and HUD components are not re-rendering on every `players:update` tick (they should only re-render when their subscribed store slice changes)

---

## Anti-Patterns to Avoid During Implementation

1. **Do not create abstractions speculatively.** Only extract if 2+ existing copies exist or if the extraction clearly reduces coupling. "We might need this later" is not a reason.
2. **Do not add new props to primitives to handle edge cases.** If `Button.tsx` needs a seventh variant just for one button, either handle it with `className` override or keep that button unstyled.
3. **Do not move game logic into React hooks.** `usePhaserGame.ts` should only manage lifecycle (boot/destroy). Movement math stays in `game/systems/`.
4. **Do not merge `runtimeUiStore` and `chatUiStore`.** They have different scopes and different reset triggers.
5. **Do not change socket event names.** The server and client must stay in sync; event name changes break the protocol.

---

## Summary Table

| Phase | Focus | Risk | Duration |
|---|---|---|---|
| PR-1..3 | Safety net (baseline + types + docs) | Low | 0.5 day |
| Phase 1 | Extract duplicate utilities | Low | 1–2 days |
| Phase 2 | UI primitive library | Low-Medium | 2–3 days |
| Phase 3 | Decompose monolithic files | Medium | 3–4 days |
| Phase 4 | State management SSOT | Low-Medium | 2 days |
| Phase 5 | Directory restructure | Low (mechanical) | 1 day |
| Phase 6 | Full QA regression | — | 1 day |
| **Total** | | | **~12–14 days** |

> Each phase is independently deployable. If a phase introduces a regression, revert only that phase without affecting phases already merged.

