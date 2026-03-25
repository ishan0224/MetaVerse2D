# Game Layer

Reserved for Phaser integration and gameplay runtime code.

Rules:
- Keep this layer focused on rendering and local scene orchestration.
- Networking is NOT allowed in this layer. Phaser code must never import or use sockets directly.
- Consume stable interfaces from `network` and shared packages.
- Entities are dumb render/data holders with no input or movement logic.
- Systems own gameplay logic orchestration (input mapping and movement application).
- Movement calculations must use shared engine functions from `packages/shared`.
- Player name labels are created once per entity and only repositioned/updated afterward (no per-frame text object creation).
- `game/utils/createNameLabel.ts` is the shared utility for both local and remote player label creation.
- Remote players must be rendered via buffered interpolation (time-based smoothing) instead of direct snap-to-server position.
- Local player remains immediate/responsive and is not interpolated.
- Scene enforces world boundaries through server-authoritative clamped positions and world camera bounds.
- Players exist in room context; only same-room snapshots are rendered.
- `ProximityVoiceSystem` manages automatic voice connect/disconnect orchestration.
- Proximity detection and voice transport are separated: proximity is consumed from server state, WebRTC stays in `network/rtc`.
