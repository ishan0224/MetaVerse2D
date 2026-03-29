# Network Layer

Reserved for frontend networking clients and transport adapters.

Rules:
- This is the bridge layer between UI/game modules and backend transports.
- Encapsulate all socket/WebRTC client concerns here.
- Expose typed interfaces for use by the game layer.
- Keep side effects isolated and testable.
- Auth session management is handled through Supabase client APIs (email/password auth).
- Access JWT must be attached to:
  - Socket.IO handshake (`auth.token`)
  - HTTP requests as `Authorization: Bearer <jwt>` when calling persistence endpoints
- Do not pass or persist passwords outside Supabase Auth SDK calls.
- This app does not implement custom auth cookies; token transport is explicit via handshake/bearer headers.
- Multiplayer communication is input-based: clients send input state + delta, then consume authoritative player snapshots from server broadcasts.
- Authoritative player snapshots include stable player identity/render fields (e.g., `id`, `x`, `y`, `color`) to keep cross-client visuals consistent.
- On connection, clients send `join` payload with `{ name, worldId, roomId }`.
- Join payload includes `{ name, worldId, roomId, avatarId?, avatarUrl? }`; `avatarId` is optional (`1-4`) for sprite-sheet character selection.
- `avatarUrl` remains optional and must be absolute `http/https`.
- For interpolation, snapshots are timestamped on client receipt and then consumed by the game interpolation layer.
- Server updates are scoped to `(worldId, roomId)` and include proximity data (`playerId -> nearbyPlayerIds`) computed authoritatively within that scope.
- Authoritative snapshots include optional `avatarId` and `avatarUrl` so remote clients can render the selected sprite avatar with image fallback behavior.
- `rtcManager` handles WebRTC peer connections and media lifecycle in the network layer.
- Socket.IO is used only for signaling (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`), while audio flows peer-to-peer over WebRTC.
- WebRTC ICE server config is env-driven:
  - `NEXT_PUBLIC_WEBRTC_STUN_URLS` (comma-separated STUN URLs)
  - `NEXT_PUBLIC_WEBRTC_TURN_URLS` (comma-separated TURN URLs)
  - `NEXT_PUBLIC_WEBRTC_TURN_USERNAME`
  - `NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL`
- Voice connection targeting is automatic and proximity-driven by game orchestration; no manual peer selection UI is used at runtime.
- `rtcManager` exposes peer playback controls (`setPeerVolume`, `setPeerMuted`) and local outbound mic control (`setLocalMicEnabled`) for game-layer orchestration.
- UI lifecycle messaging (connecting/joining/mic states) may subscribe to transport and media readiness signals but should keep presentation concerns in `components` + `lib` state stores.
