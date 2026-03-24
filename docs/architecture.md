# Architecture

## High-Level System Design

The repository is organized as a monorepo with independent deployable apps (`web`, `server`) and shared packages (`shared`, `config`).

- `apps/web`: UI shell, future game runtime integration, and client adapters.
- `apps/server`: HTTP bootstrap, future real-time transport, and domain services.
- `packages/shared`: cross-app TypeScript contracts.
- `packages/config`: shared constants and config definitions.

## Frontend vs Backend Responsibilities

- Frontend responsibilities:
  - Render UI/application shell.
  - Host game runtime modules.
  - Consume backend services through isolated networking adapters.

- Backend responsibilities:
  - Own process/server bootstrap.
  - Host transport entry points (HTTP/Socket).
  - Enforce authoritative game/domain rules (implemented in later phases).

## Data Flow Overview

Primary flow: `React -> Game -> Network -> Server`
Movement pipeline: `Input -> Movement Engine -> Separation System -> Broadcast`
Client rendering pipeline: `Server Update -> Buffer -> Interpolation -> Render`

1. React mounts and manages the game container lifecycle.
2. Game layer (Phaser) handles rendering/runtime concerns only.
3. Network layer owns transport clients and forwards events to backend.
4. Server transport layer receives inputs, resolves movement and anti-overlap separation, then broadcasts authoritative state.
5. Shared contracts in `packages/shared` define payload shapes across boundaries.
