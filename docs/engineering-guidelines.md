# Engineering Guidelines

## Core Principles

- SOLID: favor composable modules with clear interfaces.
- KISS: choose the simplest design that satisfies current phase requirements.
- DRY: centralize reusable contracts in shared packages.
- SoC: isolate rendering, networking, and domain logic into dedicated layers.

## Architecture Rules

- No networking inside the game layer.
- Server is authoritative for multiplayer/world state.
- Build and ship in strict phase order; do not skip unresolved phase issues.
- Keep transport concerns (Socket.IO/WebRTC) separate from domain services.
- Shared contracts must live in `packages/shared`.
