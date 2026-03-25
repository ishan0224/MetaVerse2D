# Socket Layer

Reserved for Socket.IO gateway setup and real-time event routing.

Rules:
- Keep transport-level concerns here.
- Delegate business rules to domain services.
- Expose typed contracts from shared packages.
- Broadcast authoritative updates to room-specific channels only.
