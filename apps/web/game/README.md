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
- Players can render as either default colored rectangles or optional image avatars from server-authoritative `avatarUrl`.
- Image avatars must preserve the original rectangle avatar dimensions; visuals only, no movement/collision size change.
- `ProximityVoiceSystem` manages automatic voice connect/disconnect orchestration.
- Proximity detection and voice transport are separated: proximity is consumed from server state, WebRTC stays in `network/rtc`.
- Voice is fully proximity-driven at runtime (no manual target/connect controls in UI flow).
- Voice orchestration also manages distance-based playback attenuation and local mic modes (`MUTED`, `PUSH_TO_TALK`, `ALWAYS_ON`).
- Keyboard controls: `Space` is push-to-talk hold, `M` toggles mute/unmute mode only.
- Per-remote-player playback mute/unmute is controlled in UI state and applied in real time.
- Avatar fallback rule: if `avatarUrl` is empty, invalid, or image load fails, keep rectangle avatar rendering.
- Join/connect visual feedback (HUD + lifecycle overlay) is handled in web UI layer, not in Phaser scene/entity logic.
