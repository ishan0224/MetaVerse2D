# Domain

Reserved for server-side business and world state logic.

Rules:
- Domain logic must be framework-agnostic.
- Keep deterministic rules isolated from IO adapters.
- Reuse shared contracts for cross-service consistency.
- Keep room grouping in dedicated managers/systems (`RoomManager`, spawn, movement, separation).
- Spawn policy should remain deterministic and server-authoritative: room assignment strategy, center-first spawn, and collision-safe fallback all belong in domain layer.
- Movement authority must enforce static world collisions (tile walls + object/furniture blockers) before broadcasting player state.
- Persistence integration belongs in service/db layers; domain remains in-memory and deterministic.
