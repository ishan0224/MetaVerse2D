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
- Player identity is server-authoritative and includes `name`, `worldId`, `roomId`, and optional `avatarUrl` (http/https only).
- Join routing is scoped by composite `(worldId, roomId)` buckets so worlds and rooms are isolated from each other.
- Spawn positions remain server-authoritative and center-first by world region with collision-safe fallback.
- Persistence layer (Phase 8) uses PostgreSQL (Supabase) + Drizzle with a dedicated `db` and `services` boundary.
- Real-time movement remains in-memory; DB writes happen only off hot path (disconnect persistence).
- Join may read persisted state once for reconnect restore; DB failures must fallback to default spawn behavior.
- `SERVER_DATABASE_URL` controls persistence enablement; when absent, server runs in memory-only mode.
- Server runtime and Drizzle commands auto-load env from `apps/server/.env` (root `.env` fallback is supported for legacy setup).
- Minimal persistence HTTP endpoints are exposed for non-realtime access:
  - `GET/POST /api/users`
  - `GET/POST /api/player-state`

## Supabase + Drizzle Quick Start

1. Copy server env template:
   ```bash
   cp apps/server/.env.example apps/server/.env
   ```
2. Set `SERVER_DATABASE_URL` in `apps/server/.env` using your Supabase pooled Postgres URL:
   - Format:
     ```text
     postgresql://postgres.<PROJECT-REF>:<PASSWORD>@aws-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true
     ```
   - Use the **Session Pooler (5432)** connection string from Supabase project settings.
3. Run migration from repo root:
   ```bash
   npm run db:check --workspace @metaverse2d/server
   npm run db:migrate --workspace @metaverse2d/server
   ```
4. Start server:
   ```bash
   npm run dev:server
   ```

### Optional Drizzle Commands

- Run DB preflight checks only:
  ```bash
  npm run db:check --workspace @metaverse2d/server
  ```
- Generate migration files from schema changes:
  ```bash
  npm run db:generate --workspace @metaverse2d/server
  ```
- Open Drizzle Studio:
  ```bash
  npm run db:studio --workspace @metaverse2d/server
  ```
