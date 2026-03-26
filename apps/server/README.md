# Server App

Backend runtime for HTTP and real-time transport entry points.

Rules:
- Server is authoritative for multiplayer and world state decisions.
- Keep domain logic separate from transport wiring.
- Keep startup/bootstrap concerns inside `src/core`.
- In multiplayer sync, clients send input only; server computes positions and broadcasts authoritative player state.
- `RoomManager` handles player grouping and room membership lifecycle.
- No global player state is broadcast; updates are room-scoped only.
- Proximity system computes nearby players per room and includes it in authoritative room updates.
- Player identity is server-authoritative and includes `name` plus optional `avatarUrl` (http/https only).
