'use client';

import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';

import type { OnboardingDraft } from '@/components/OnboardingOverlay';

type GameInstance = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
  scale?: {
    resize: (width: number, height: number) => void;
  };
};

type UsePhaserGameParams = {
  joinIdentity: OnboardingDraft | null;
  onGameReady: () => void;
};

type UsePhaserGameResult = {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  isGameReady: boolean;
  syncGameScaleToContainer: () => void;
  destroyGame: () => void;
};

export function usePhaserGame({
  joinIdentity,
  onGameReady,
}: UsePhaserGameParams): UsePhaserGameResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameInstance | null>(null);
  const [isGameReady, setIsGameReady] = useState(false);

  const syncGameScaleToContainer = useCallback(() => {
    const container = containerRef.current;
    const game = gameRef.current;
    if (!container || !game?.scale) {
      return;
    }

    const width = Math.max(1, Math.floor(container.clientWidth));
    const height = Math.max(1, Math.floor(container.clientHeight));
    game.scale.resize(width, height);
  }, []);

  const destroyGame = useCallback(() => {
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }
    setIsGameReady(false);
  }, []);

  useEffect(() => {
    if (!joinIdentity || gameRef.current) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let rafId: number | null = null;

    const scheduleScaleSync = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (cancelled) {
          return;
        }
        syncGameScaleToContainer();
      });
    };

    const handleViewportResize = () => {
      scheduleScaleSync();
    };

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleViewportResize);
      resizeObserver.observe(container);
    }
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', handleViewportResize);
    window.visualViewport?.addEventListener('resize', handleViewportResize);

    void (async () => {
      const { initializeGame } = await import('@/game');
      if (cancelled) {
        return;
      }

      gameRef.current = initializeGame(container);
      scheduleScaleSync();
      await waitForFirstPaint();
      if (cancelled) {
        return;
      }

      setIsGameReady(true);
      onGameReady();
    })();

    return () => {
      cancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      resizeObserver?.disconnect();
      resizeObserver = null;
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('orientationchange', handleViewportResize);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      destroyGame();
    };
  }, [destroyGame, joinIdentity, onGameReady, syncGameScaleToContainer]);

  useEffect(() => {
    return () => {
      destroyGame();
    };
  }, [destroyGame]);

  return {
    containerRef,
    isGameReady,
    syncGameScaleToContainer,
    destroyGame,
  };
}

async function waitForFirstPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}
