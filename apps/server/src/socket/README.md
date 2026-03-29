# Socket Layer

Reserved for Socket.IO gateway setup and real-time event routing.

Rules:
- Keep transport-level concerns here.
- Delegate business rules to domain services.
- Expose typed contracts from shared packages.
- Require authenticated socket handshake before registering gameplay handlers.
- Verify Supabase JWT server-side for every new socket connection.
- Broadcast authoritative updates to room-specific channels only.
- On `join`, normalize `worldId`/`roomId` defaults plus optional `avatarId` (`1-4`), and validate/sanitize optional avatar URL (`http`/`https` only) before passing to domain/player state.
- On `join`, resolve/create persistence user from verified auth identity (`auth_user_id` + `email`) and optional display name, then try loading last known `player_state`; if unavailable or DB fails, fallback to standard spawn.
- On `join`, players are routed into a composite scope `(worldId, roomId)` and broadcasts/proximity are isolated to that scope.
- Spawn selection is server-authoritative and center-first per selected world region, with collision-safe fallback if center is blocked.
- Movement events must remain DB-free (in-memory only); persistence writes occur on disconnect via service layer with graceful failure handling.
- Never authorize by client-provided `userId` or player payload; authorization source is verified JWT identity only.
- WebRTC signaling events are transport-only and scope-gated to same `(worldId, roomId)` peers; media (audio/video) remains peer-to-peer.
