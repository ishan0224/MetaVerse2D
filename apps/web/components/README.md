# Components

Reusable UI components for the frontend application.

Rules:
- Keep components presentation-focused.
- Avoid embedding game engine or networking concerns here.
- Co-locate component-specific styles/tests when introduced.
- Runtime HUD/overlay components (`TopRightStatusCluster`, `JoinStatusOverlay`, `MicModeCircle`) should consume UI state/stores in web layer instead of directly owning transport/game state.
