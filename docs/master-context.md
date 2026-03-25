# Master Context

## Product Overview

MetaVerse2D is a 2D multiplayer spatial application where users move in a shared world and communicate through proximity-based voice.

## Current Phase Status

- Phase 0 (foundation scaffolding): complete.
- Phase 1 (single player deterministic local movement): complete.
- Phase 2 (multiplayer core sync): complete.
- Phase 2.1 (player identity/name sync): complete.
- Phase 2.2 (server-authoritative anti-overlap separation): complete.
- Phase 3 (client-side interpolation for remote players): complete.
- Phase 4 (room-based world isolation + spawn system): complete.
- Phase 5 (server-authoritative room-scoped proximity detection): complete.
- Phase 6 (manual WebRTC voice infrastructure + signaling): complete.
- Phase 7 (automatic proximity-based voice orchestration): complete.
- Current repo state: server-authoritative multiplayer sync is input-based (`client input -> server movement update -> authoritative broadcast`) and uses shared movement logic from `packages/shared`.
- Current movement pipeline: `input -> shared movement engine -> shared separation system -> authoritative broadcast`.
- Current client rendering pipeline: `server updates -> per-player buffers -> interpolation -> render`.
- Current server room flow: `join -> room assignment -> spawn -> movement -> room-only broadcast`.
- Current server proximity pipeline: `movement -> separation -> proximity -> room-only broadcast`.
- Current voice setup: WebRTC for audio media, Socket.IO signaling relay only, manual connect/disconnect.
- Current proximity voice setup: server proximity map drives auto connect/disconnect via client voice controller and rtcManager.
- Security/tooling baseline: hardened from initial scaffold, lint/typecheck/build passing.

## Stack

- Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS
- Backend: Node.js, TypeScript, Express, Socket.IO (integration deferred)
- Shared: Monorepo packages for shared types and config
- Tooling: ESLint, Prettier, workspace TypeScript configs

## Architecture Constraints (Must Hold)

- Keep game runtime concerns under `apps/web/game`.
- Keep networking concerns under `apps/web/network` and `apps/server/src/socket`.
- No networking logic inside game layer.
- Server is authoritative for multiplayer state.
- Shared cross-app contracts live in `packages/shared`.
- Keep phase order strict; do not start next phase before current phase is stable/demoable.

## Working Rules For Agents

- Treat this file as high-signal context only.
- Update this file only when architecture, constraints, phase status, or key decisions change.
- Do not add implementation logs or verbose progress notes here.
- Put implementation details and reasoning in `localnotes/` (gitignored).

## Phase Plan

1. Foundation setup (app structure, build/lint/typecheck baseline)
2. Single player movement
3. Multiplayer sync
4. Interpolation and smoothing
5. Rooms and world boundaries
6. Proximity detection
7. WebRTC voice infrastructure
8. Automated proximity voice
9. Persistence layer
10. Polish and deployment
