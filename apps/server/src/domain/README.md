# Domain

Reserved for server-side business and world state logic.

Rules:
- Domain logic must be framework-agnostic.
- Keep deterministic rules isolated from IO adapters.
- Reuse shared contracts for cross-service consistency.
- Keep room grouping in dedicated managers/systems (`RoomManager`, spawn, movement, separation).
