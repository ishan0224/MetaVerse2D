# Network Layer

Reserved for frontend networking clients and transport adapters.

Rules:
- This is the bridge layer between UI/game modules and backend transports.
- Encapsulate all socket/WebRTC client concerns here.
- Expose typed interfaces for use by the game layer.
- Keep side effects isolated and testable.
- Multiplayer communication is input-based: clients send input state + delta, then consume authoritative player snapshots from server broadcasts.
- Authoritative player snapshots include stable player identity/render fields (e.g., `id`, `x`, `y`, `color`) to keep cross-client visuals consistent.
- On connection, clients send `join` payload with `{ name, roomId }` so server-authoritative identity and room assignment are established before movement updates.
- For interpolation, snapshots are timestamped on client receipt and then consumed by the game interpolation layer.
- Server room updates include proximity data (`playerId -> nearbyPlayerIds`) computed authoritatively on the backend.
- `rtcManager` handles WebRTC peer connections and media lifecycle in the network layer.
- Socket.IO is used only for signaling (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`), while audio flows peer-to-peer over WebRTC.
