'use client';

import { useEffect, useState } from 'react';

import {
  detectTouchDevice,
  type GameplayViewportSnapshot,
  resolveGameplayViewportSnapshot,
} from '@/lib/gameplayViewportConfig';

export function useGameplayViewport(): GameplayViewportSnapshot {
  const [snapshot, setSnapshot] = useState<GameplayViewportSnapshot>(() =>
    resolveGameplayViewportSnapshot({
      viewportWidth: 1280,
      viewportHeight: 720,
      isTouchDevice: false,
    }),
  );

  useEffect(() => {
    const updateSnapshot = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const isTouchDevice = detectTouchDevice(window);
      const nextSnapshot = resolveGameplayViewportSnapshot({
        viewportWidth,
        viewportHeight,
        isTouchDevice,
      });

      setSnapshot((previous) => {
        if (
          previous.viewportWidth === nextSnapshot.viewportWidth &&
          previous.viewportHeight === nextSnapshot.viewportHeight &&
          previous.frameWidth === nextSnapshot.frameWidth &&
          previous.frameHeight === nextSnapshot.frameHeight &&
          previous.isTouchDevice === nextSnapshot.isTouchDevice &&
          previous.isLandscape === nextSnapshot.isLandscape &&
          previous.isMobileOrTablet === nextSnapshot.isMobileOrTablet &&
          previous.requiresLandscapePrompt === nextSnapshot.requiresLandscapePrompt &&
          previous.deviceClass === nextSnapshot.deviceClass
        ) {
          return previous;
        }

        return nextSnapshot;
      });
    };

    updateSnapshot();

    window.addEventListener('resize', updateSnapshot);
    window.addEventListener('orientationchange', updateSnapshot);
    window.visualViewport?.addEventListener('resize', updateSnapshot);
    window.visualViewport?.addEventListener('scroll', updateSnapshot);

    return () => {
      window.removeEventListener('resize', updateSnapshot);
      window.removeEventListener('orientationchange', updateSnapshot);
      window.visualViewport?.removeEventListener('resize', updateSnapshot);
      window.visualViewport?.removeEventListener('scroll', updateSnapshot);
    };
  }, []);

  return snapshot;
}
