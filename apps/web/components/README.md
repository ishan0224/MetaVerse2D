# Components

Reusable UI components for the frontend application.

Rules:
- Keep components presentation-focused.
- Avoid embedding game engine or networking concerns here.
- Co-locate component-specific styles/tests when introduced.
- Runtime HUD/overlay components (`TopRightStatusCluster`, `JoinStatusOverlay`, `MicModeCircle`) should consume UI state/stores in web layer instead of directly owning transport/game state.
- Keyboard input bindings for runtime voice mode (`VoiceKeyboardBindings`) should remain mounted independently from optional control panels to avoid state regressions when UI panels are removed.
- Test minimap feature toggle:
  - Toggle file: `apps/web/config/features.ts`
  - Flag: `ENABLE_TEST_MINIMAP`
  - Set to `false` (or comment render usage in `GameCanvas`) to disable quickly.
- Runtime circle placement map:
  - Top-right cluster: room circle, connection+population circle, avatar circle.
  - Top-right under avatar: mic mode circle.
  - Bottom-right: circular minimap (when `ENABLE_TEST_MINIMAP` is `true`).
- Top-right avatar preview precedence:
  - `avatarUrl` image (if available and load succeeds)
  - selected `avatarId` standing sprite frame (`936/940/944/948` for ids `1/2/3/4`)
  - color fallback square
- Circular minimap (`CircularMinimap`) is room-isolated by runtime `(worldId, roomId)` scoped snapshots from `players:update`.
- Minimap base rendering comes from TMJ rasterization (`minimapTilemapRasterizer.ts`) using `FullMap16x16.normalized.tmj` + referenced tileset images.
- If minimap base appears black, verify map JSON path and tileset image paths under `apps/web/public/tilemaps/fullmap16x16/images`.
- Manual QA checklist for test minimap:
  - Move local player to each map edge/corner and verify minimap panning clamps cleanly.
  - Verify local marker is distinct from remote markers.
  - Verify two clients in same `(worldId, roomId)` can see each other on minimap.
  - Verify clients in different world or room do not appear.
  - Smoke test localhost and tunnel URL.
