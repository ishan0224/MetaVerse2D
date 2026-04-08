# Improve Code Implementation Progress

This file tracks implementation status for `improvecode.md` so work can resume from any phase with full context.

## Current Checkpoint
- Status: `In Progress`
- Source Plan: [`improvecode.md`](./improvecode.md)
- Last Updated: 2026-04-03
- Execution Hold: `Cleared (user approved starting Phase 2).`

## Pre-Requisites
- [x] PR-1 Baseline Snapshot (manual browser QA)
- [x] PR-2 TypeScript strict alignment + workspace typecheck
- [x] PR-3 Add one-line `@module` JSDoc to every file in `apps/server/src/` and `apps/web/network/`

## Phase 1 — Extract Shared Utilities (DRY / SSOT)
- [x] 1.1 Create `apps/web/lib/spriteUtils.ts` and replace local copies in onboarding + top-right cluster
- [x] 1.2 Create `apps/web/lib/colorUtils.ts` and replace local `numberToHexColor` copies
- [x] 1.3 Create `apps/server/src/domain/avatarUtils.ts` and consolidate server `normalizeAvatarUrl`
- [x] 1.4 Create `apps/web/lib/onboardingValidation.ts` and move onboarding validation helpers
- [x] Phase 1 QA checklist complete

## Phase 2 — UI Primitive Library
- [x] 2.1 `components/ui/Button.tsx`
- [x] 2.2 `components/ui/TextInput.tsx`
- [x] 2.3 `components/ui/FormLabel.tsx`
- [x] 2.4 `components/ui/PanelSection.tsx`
- [x] 2.5 `components/ui/HudCircle.tsx`
- [x] 2.6 `components/ui/InlineMessage.tsx`
- [ ] Phase 2 QA checklist complete

## Phase 3 — Decompose Monoliths
- [x] 3.1 Decompose `OnboardingOverlay.tsx`
- [x] 3.2 Decompose `GameCanvas.tsx`
- [x] 3.3 Split `apps/server/src/socket/handlers.ts`
- [ ] Phase 3 QA checklist complete

## Phase 4 — State Management Hardening
- [x] 4.1 `createObservableStore` + refactor `runtimeUiStore` + `chatUiStore`
- [x] 4.2 Move/refactor `voiceControlStore` into `apps/web/lib/`
- [x] 4.3 Add `playerIdentityBridge.ts` and unify identity write sequence
- [ ] Phase 4 QA checklist complete

## Phase 5 — Directory Finalization
- [x] Move files to final proposed structure
- [x] Update imports/aliases and verify typecheck
- [x] Phase 5 QA checklist complete

## Phase 6 — Final QA Pass
- [x] Functional regression matrix complete
- [x] Code quality validation checks complete
- [ ] Performance sanity checks complete

## Resume Instructions
1. Open this file and find the first unchecked item in the current phase.
2. Implement only that item + run relevant QA checks.
3. Update checkbox status and append a short checkpoint note.

## Checkpoint Notes
- `2026-04-03`: Progress tracker initialized.
- `2026-04-03`: PR-3 completed (`@module` headers added for all `apps/server/src` + `apps/web/network` TypeScript files).
- `2026-04-03`: Phase 1.1–1.4 implemented. Shared sprite/color/onboarding-validation utilities added, server avatar URL normalization consolidated into `apps/server/src/domain/avatarUtils.ts`.
- `2026-04-03`: Verification complete for refactor changes: `npm run typecheck` passed and targeted `eslint` passed for `apps/server/src`, `apps/web/network`, and all Phase 1 touched files.
- `2026-04-03`: Repository lint baseline unblocked by auto-sorting `packages/shared/types/index.ts`; `npm run lint` now passes.
- `2026-04-03`: User approved moving ahead to Phase 2 after manual browser verification.
- `2026-04-03`: Phase 2.1–2.6 implemented. Added `apps/web/components/ui/index.ts` barrel and integrated primitives into `OnboardingOverlay`, `VoiceControls`, `TopRightStatusCluster`, `MicModeCircle`, and `BottomAvatarCircle` with no behavioral flow changes.
- `2026-04-03`: Verification after Phase 2 implementation: `npm run typecheck` and `npm run lint` both pass.
- `2026-04-03`: Joystick duplicate-instance issue fixed in `apps/web/components/Joystick.tsx` by enforcing single-manager reinitialization guard; verified with `npm run typecheck` and `npm run lint`.
- `2026-04-03`: Phase 3.1 implemented: onboarding decomposed into `components/onboarding/` with `OnboardingOverlay` orchestrator, extracted step components, `AvatarSpritePreview`, `onboardingTypes`, and `worldOptions`. Existing `components/OnboardingOverlay.tsx` kept as compatibility re-export.
- `2026-04-03`: Phase 3.2 implemented: `GameCanvas` responsibilities extracted into hooks (`useOnboardingSession`, `usePhaserGame`, `useSocketLifecycle`, `useBackdropHandoff`), and `GameCanvas.tsx` reduced to assembly/render logic.
- `2026-04-03`: Phase 3.3 implemented: socket payloads/session maps/normalizers/join flow extracted into `payloadTypes.ts`, `sessionState.ts`, `normalizers.ts`, and `joinHandler.ts`; `socket/handlers.ts` updated to wiring + tick orchestration.
- `2026-04-03`: Verification after Phase 3 implementation: `npm run typecheck` and `npm run lint` both pass.
- `2026-04-03`: Phase 4.1 implemented: added `apps/web/lib/createObservableStore.ts`; refactored `runtimeUiStore.ts` and `chatUiStore.ts` to use the shared observable store factory while keeping public APIs unchanged.
- `2026-04-03`: Phase 4.2 implemented: moved voice control store to `apps/web/lib/voiceControlStore.ts`, updated imports across components/hooks/game systems/scenes, and removed legacy `apps/web/game/systems/voiceControlStore.ts`.
- `2026-04-03`: Phase 4.3 implemented: added `apps/web/lib/playerIdentityBridge.ts` with `applyJoinIdentity(draft)` and replaced scattered identity setter sequence in `useSocketLifecycle.ts` with this single call site.
- `2026-04-03`: Verification after Phase 4 implementation: `npm run typecheck` and `npm run lint` both pass.
- `2026-04-03`: Phase 5 implemented (directory finalization, web): moved HUD components into `apps/web/components/hud/` (`TopRightStatusCluster`, `JoinStatusOverlay`, `MicModeCircle`, `BottomAvatarCircle`, `CircularMinimap`, `VoiceControls`), updated `GameCanvas` imports and `CircularMinimap` helper import paths.
- `2026-04-03`: Verification after Phase 5 implementation: `npm run typecheck --workspaces` and `npm run lint` both pass.
- `2026-04-03`: User confirmed Phase 5 manual QA is working end-to-end; marked Phase 5 QA checklist complete.
- `2026-04-03`: Phase 6 automated code-quality audit run and validations pass for duplication/forbidden-import rules (`normalizeAvatarUrl` definition centralized, `numberToHexColor` definition centralized, `listeners` store pattern centralized via `createObservableStore`, UI primitives remain decoupled from network/game/stores, game layer has no direct `socket.io-client`/Supabase imports).
- `2026-04-03`: Phase 6 compliance fixes applied with no logic changes: `RoomChatOverlay` now uses shared `spriteUtils` loader/frame-style helper; `network/auth/authSession` now uses shared `createObservableStore` factory. Verification: `npm run typecheck --workspaces` and `npm run lint` both pass.
- `2026-04-03`: Phase 6 structural threshold pass complete with no logic changes: extracted onboarding panel shell + flow helpers, moved `GameCanvas` runtime effects into `useGameCanvasRuntimeEffects`, and split socket connection wiring into `connectionHandlers.ts`. Current line counts meet plan targets (`OnboardingOverlay.tsx` 186, `GameCanvas.tsx` 142, `socket/handlers.ts` 78).
- `2026-04-03`: Runtime startup smoke checks: `dev:web` boots successfully outside sandbox (`Next.js ready on :3001` because `:3000` already in use). `dev:server` startup check hits `EADDRINUSE` on `:4000` (existing process already bound). Pending for full Phase 6 completion: manual functional regression matrix + manual performance sanity check in DevTools.
- `2026-04-03`: User confirmed Phase 6 functional regression matrix passed; performance sanity check remains pending.

## Manual Checklist Details

### PR-1 Baseline Snapshot (Manual)
- [x] Open browser at `http://localhost:3000`, complete full onboarding flow (login, avatar select, world select, room confirm), confirm landing in game world.
- [x] Open second browser tab, join same world + room, verify both players visible.
- [x] Cycle mic modes (`M` key), verify `MicModeCircle` icon changes.
- [x] Move player, verify position sync to second tab without rubber-banding.
- [x] On mobile (or devtools mobile mode), verify touch joystick appears and `RotateDeviceOverlay` fires in portrait.
- [x] Disconnect and reconnect; verify player re-spawns near last position.
- [x] Screenshot/record baseline for regression comparison.

### Phase 1 QA Checklist (Manual)
- [x] Run `npm run typecheck --workspaces` — zero errors.
- [x] Run full onboarding flow end-to-end — works identically.
- [x] Verify avatar sprite previews animate correctly in onboarding and `TopRightStatusCluster`.
- [x] Verify color circle renders correctly when no avatar URL is set.

### Phase 2 QA Checklist (Manual)
- [ ] All onboarding steps render visually identically to baseline screenshot.
- [ ] Button hover/focus states work correctly (keyboard tab navigation).
- [ ] All form inputs accept input without regression (email, password, name, room ID).
- [ ] `Enter` key advances steps as before.
- [ ] `HudCircle` renders correctly in top-right cluster and `MicModeCircle`.
- [ ] `touchOptimized` sizing still applies correctly on mobile viewport.

### Phase 3 QA Checklist (Manual)
- [ ] Full end-to-end game session: onboard → join → move → see remote players.
- [ ] Step navigation in onboarding: forward (Continue) and backward (Back) for all 4 steps.
- [ ] Auth: login with existing account, sign up with new account, Continue Saved Session flow.
- [ ] Email availability debounce: type an email and wait, verify debounce fires once.
- [ ] Socket reconnection: restart server and verify client auto-reconnects.
- [ ] Game tick continues after reconnect (remote players still update).
- [ ] `handleJoin` still loads persisted spawn position on reconnect.

### Phase 4 QA Checklist (Manual + Targeted Validation)
- [ ] `createObservableStore` behavior check: subscribe, setState, unsubscribe/reset flow verified (listener firing and cleanup).
- [ ] Room population counter in top-right HUD updates correctly when a second player joins.
- [ ] Mic mode icon changes correctly when `M` is pressed.
- [ ] Chat messages appear correctly in room chat overlay.
- [ ] On refresh, session storage still pre-populates onboarding fields.
