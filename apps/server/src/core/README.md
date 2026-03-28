# Core

Server bootstrap and process lifecycle wiring.

Responsibilities:
- Initialize Express and HTTP server runtime (`server.ts`).
- Attach framework-level middleware when required.
- Register lightweight persistence HTTP routes (`/api/users`, `/api/player-state`) for non-realtime access paths.
- Enforce bearer-token auth on persistence routes and resolve identity from verified Supabase JWT.
- Keep auth transport explicit (`Authorization: Bearer <jwt>`); no app-managed cookie session middleware in this layer.
- Keep startup concerns separate from domain logic.
