# Server App

Backend runtime for HTTP and real-time transport entry points.

Rules:
- Server is authoritative for multiplayer and world state decisions.
- Keep domain logic separate from transport wiring.
- Keep startup/bootstrap concerns inside `src/core`.
- In multiplayer sync, clients send input only; server computes positions and broadcasts authoritative player state.
