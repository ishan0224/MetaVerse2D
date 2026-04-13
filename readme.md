# MetaVerse2D

A browser-based **2D multiplayer metaverse prototype** built with a monorepo architecture.

It combines a Phaser-powered game client, a Next.js web shell, a Socket.IO authoritative server, Supabase auth, and optional Postgres persistence via Drizzle.

## Live Demo

**Production:** [https://meta-verse2-d-web.vercel.app/](https://meta-verse2-d-web.vercel.app/)

## Gameplay Preview

### Desktop Demo

![MetaVerse2D Desktop Demo](./metaversedesktop.gif)

### Mobile/Tablet Demo

![MetaVerse2D Mobile and Tablet Demo](./metaversemobile.gif)

## Features

- Real-time multiplayer movement with server-authoritative state
- Room/world scoped presence and updates
- Shared movement/interpolation/proximity utilities for deterministic behavior
- Proximity-based voice chat orchestration (WebRTC)
- Room chat overlay
- Onboarding flow (identity, world/room selection, avatar setup)
- Mobile touch controls + desktop keyboard controls
- Supabase JWT-based authentication flow
- Optional PostgreSQL persistence (Supabase Postgres + Drizzle)

## Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Phaser 3, Zustand
- **Realtime:** Socket.IO (client + server)
- **Auth:** Supabase Auth (JWT)
- **Database:** PostgreSQL (Supabase) + Drizzle ORM
- **Backend:** Node.js, Express, TypeScript
- **Monorepo:** npm workspaces

## Repository Structure

```text
.
├── apps/
│   ├── web/        # Next.js + Phaser client
│   └── server/     # Express + Socket.IO authoritative server
├── packages/
│   ├── shared/     # shared types + gameplay utilities
│   └── config/     # shared config helpers
└── docs/           # project notes and docs
```

## Getting Started

### 1. Prerequisites

- Node.js 18+
- npm 9+

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp apps/web/.env.example apps/web/.env
cp apps/server/.env.example apps/server/.env
```

Fill in required values in both files.

### 4. Run the project (two terminals)

Terminal 1 (server):

```bash
npm run dev:server
```

Terminal 2 (web):

```bash
npm run dev:web
```

Open: `http://localhost:3000`

## Environment Variables

### `apps/web/.env`

- `NEXT_PUBLIC_SOCKET_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_WEBRTC_STUN_URLS`
- `NEXT_PUBLIC_WEBRTC_TURN_URLS`
- `NEXT_PUBLIC_WEBRTC_TURN_USERNAME`
- `NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL`

### `apps/server/.env`

- `SERVER_PORT`
- `CLIENT_ORIGIN`
- `CLIENT_ORIGIN_PREVIEW`
- `ALLOW_DEV_TUNNEL_ORIGINS`
- `SERVER_DATABASE_URL`
- `SERVER_SUPABASE_URL`
- `SERVER_SUPABASE_ANON_KEY`

## Workspace Scripts (Root)

```bash
npm run dev          # start web app
npm run dev:web      # start web app
npm run dev:server   # start server app
npm run build        # build all workspaces
npm run lint         # lint entire monorepo
npm run typecheck    # type-check all workspaces
npm run format       # check formatting
npm run format:write # write formatting
```

## Database (Optional)

If you configure `SERVER_DATABASE_URL`, you can run Drizzle migrations:

```bash
npm run db:check --workspace @metaverse2d/server
npm run db:migrate --workspace @metaverse2d/server
```

If `SERVER_DATABASE_URL` is not set, the server runs in memory-only mode.

## Deployment

- Web client is deployed on **Vercel**.
- Live URL: [https://meta-verse2-d-web.vercel.app/](https://meta-verse2-d-web.vercel.app/)

## Notes

- The server is authoritative for movement, room membership, and multiplayer sync.
- Clients send input; the server computes and broadcasts player state.
- Game rendering and gameplay presentation stay in the client layer, while transport and domain logic are separated in backend modules.
