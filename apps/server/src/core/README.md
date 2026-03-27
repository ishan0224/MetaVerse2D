# Core

Server bootstrap and process lifecycle wiring.

Responsibilities:
- Initialize Express and HTTP server runtime (`server.ts`).
- Attach framework-level middleware when required.
- Register lightweight persistence HTTP routes (`/api/users`, `/api/player-state`) for non-realtime access paths.
- Keep startup concerns separate from domain logic.
