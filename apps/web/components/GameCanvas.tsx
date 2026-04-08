'use client';

import type { CSSProperties } from 'react';

import { CircularMinimap } from '@/components/hud/CircularMinimap';
import { JoinStatusOverlay } from '@/components/hud/JoinStatusOverlay';
import { MicModeCircle } from '@/components/hud/MicModeCircle';
import { TopRightStatusCluster } from '@/components/hud/TopRightStatusCluster';
import { OnboardingOverlay } from '@/components/OnboardingOverlay';
import { RoomChatOverlay } from '@/components/RoomChatOverlay';
import { RotateDeviceOverlay } from '@/components/RotateDeviceOverlay';
import { TouchGameplayControls } from '@/components/TouchGameplayControls';
import { VoiceKeyboardBindings } from '@/components/VoiceKeyboardBindings';
import { ENABLE_TEST_MINIMAP } from '@/config/features';
import { useBackdropHandoff } from '@/hooks/useBackdropHandoff';
import { useGameCanvasRuntimeEffects } from '@/hooks/useGameCanvasRuntimeEffects';
import { DEFAULT_WORLD_ID, useOnboardingSession } from '@/hooks/useOnboardingSession';
import { usePhaserGame } from '@/hooks/usePhaserGame';
import { useSocketLifecycle } from '@/hooks/useSocketLifecycle';
import { useGameplayViewport } from '@/lib/useGameplayViewport';

const ONBOARDING_BASE_BACKDROP_SRC = '/world-previews/world1-onboarding-bg.png';
const WORLD_ONE_SELECTION_BACKDROP_SRC = '/world-previews/world1-selection.png';

export function GameCanvas() {
  const gameplayViewport = useGameplayViewport();
  const {
    handoffState,
    beginHandoff,
    resetHandoff,
  } = useBackdropHandoff();
  const {
    hasJoinedFlowStarted,
    initialOnboardingDraft,
    joinIdentity,
    onboardingVisualState,
    handleOnboardingComplete,
    handleOnboardingVisualStateChange,
  } = useOnboardingSession();
  const {
    containerRef,
    destroyGame,
    isGameReady,
    syncGameScaleToContainer,
  } = usePhaserGame({
    joinIdentity,
    onGameReady: beginHandoff,
  });

  useSocketLifecycle({
    isGameReady,
    joinIdentity,
  });

  const shouldUseTouchGameplayLayout =
    hasJoinedFlowStarted && gameplayViewport.isMobileOrTablet;
  const shouldGuardPortraitGameplay =
    shouldUseTouchGameplayLayout && gameplayViewport.requiresLandscapePrompt;
  const shouldShowTouchControls =
    shouldUseTouchGameplayLayout && !shouldGuardPortraitGameplay;
  const shouldUseSelectedWorldBackdrop =
    onboardingVisualState.worldId === DEFAULT_WORLD_ID &&
    (onboardingVisualState.step === 'world' ||
      onboardingVisualState.step === 'roomConfirm' ||
      hasJoinedFlowStarted);
  const onboardingBackdropSrc = shouldUseSelectedWorldBackdrop
    ? WORLD_ONE_SELECTION_BACKDROP_SRC
    : ONBOARDING_BASE_BACKDROP_SRC;
  const screenshotShouldRender = handoffState !== 'REAL_MAP_VISIBLE';
  const screenshotOpacityClass = handoffState === 'CROSSFADE' ? 'opacity-0' : 'opacity-100';
  const gameCanvasOpacityClass =
    handoffState === 'SCREENSHOT_VISIBLE' ? 'opacity-0' : 'opacity-100';

  useGameCanvasRuntimeEffects({
    baseBackdropSrc: ONBOARDING_BASE_BACKDROP_SRC,
    worldSelectionBackdropSrc: WORLD_ONE_SELECTION_BACKDROP_SRC,
    destroyGame,
    resetHandoff,
    hasJoinedFlowStarted,
    shouldGuardPortraitGameplay,
    viewportHeight: gameplayViewport.viewportHeight,
    viewportWidth: gameplayViewport.viewportWidth,
    syncGameScaleToContainer,
  });

  const screenshotLayer = screenshotShouldRender ? (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-[240ms] ease-out ${screenshotOpacityClass}`}
    >
      <img
        src={onboardingBackdropSrc}
        alt=""
        aria-hidden="true"
        decoding="sync"
        fetchPriority="high"
        className="absolute inset-0 h-full w-full select-none object-cover object-center"
        draggable={false}
      />
    </div>
  ) : null;
  const gameplayCanvasElement = (
    <div
      ref={containerRef}
      className={`relative z-10 h-full w-full transition-opacity duration-[240ms] ease-out ${shouldUseTouchGameplayLayout ? 'gameplay-touch-shell' : ''} ${gameCanvasOpacityClass}`}
    />
  );
  const shouldRenderDesktopHud = hasJoinedFlowStarted && !shouldUseTouchGameplayLayout;
  const shouldRenderTouchHud = hasJoinedFlowStarted && shouldUseTouchGameplayLayout && !shouldGuardPortraitGameplay;
  const shouldRenderChatOverlay = hasJoinedFlowStarted && !shouldUseTouchGameplayLayout;
  const rootViewportStyle: CSSProperties | undefined = shouldUseTouchGameplayLayout ? {
    width: `${gameplayViewport.viewportWidth}px`,
    height: `${gameplayViewport.viewportHeight}px`,
  } : undefined;

  return (
    <div className="relative h-screen h-[100dvh] w-full overflow-hidden bg-slate-950" style={rootViewportStyle}>
      {!shouldUseTouchGameplayLayout ? screenshotLayer : null}
      {shouldUseTouchGameplayLayout ? (
        <div className="absolute inset-0 z-10">
          <div className="relative h-full w-full overflow-hidden bg-slate-950">
            {screenshotLayer}
            {gameplayCanvasElement}
            {shouldRenderTouchHud ? <TopRightStatusCluster touchOptimized /> : null}
            {shouldRenderTouchHud ? <JoinStatusOverlay touchOptimized /> : null}
            {shouldRenderTouchHud ? <MicModeCircle placement="top-right-below" touchOptimized /> : null}
            {shouldRenderTouchHud ? <RoomChatOverlay touchOptimized /> : null}
            {shouldShowTouchControls ? <TouchGameplayControls /> : null}
          </div>
        </div>
      ) : null}
      {!hasJoinedFlowStarted ? <OnboardingOverlay initialDraft={initialOnboardingDraft} onComplete={handleOnboardingComplete} onVisualStateChange={handleOnboardingVisualStateChange} /> : null}
      {!shouldUseTouchGameplayLayout ? gameplayCanvasElement : null}
      {shouldRenderDesktopHud ? <VoiceKeyboardBindings /> : null}
      {shouldRenderDesktopHud ? <TopRightStatusCluster /> : null}
      {shouldRenderDesktopHud ? <JoinStatusOverlay /> : null}
      {shouldRenderDesktopHud ? <MicModeCircle placement="top-right-below" /> : null}
      {shouldRenderChatOverlay ? <RoomChatOverlay /> : null}
      {shouldRenderDesktopHud && ENABLE_TEST_MINIMAP ? <CircularMinimap /> : null}
      {shouldGuardPortraitGameplay ? <RotateDeviceOverlay /> : null}
    </div>
  );
}
