'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MAP_CROSSFADE_DURATION_MS = 240;

export type BackdropHandoffState =
  | 'SCREENSHOT_VISIBLE'
  | 'REAL_MAP_READY_HIDDEN'
  | 'CROSSFADE'
  | 'REAL_MAP_VISIBLE';

type UseBackdropHandoffResult = {
  handoffState: BackdropHandoffState;
  resetHandoff: () => void;
  beginHandoff: () => void;
};

export function useBackdropHandoff(): UseBackdropHandoffResult {
  const handoffTimerRef = useRef<number | null>(null);
  const [handoffState, setHandoffState] = useState<BackdropHandoffState>('SCREENSHOT_VISIBLE');

  const clearHandoffTimer = useCallback(() => {
    if (handoffTimerRef.current) {
      window.clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
  }, []);

  const resetHandoff = useCallback(() => {
    clearHandoffTimer();
    setHandoffState('SCREENSHOT_VISIBLE');
  }, [clearHandoffTimer]);

  const beginHandoff = useCallback(() => {
    clearHandoffTimer();
    setHandoffState('REAL_MAP_READY_HIDDEN');
    window.requestAnimationFrame(() => {
      setHandoffState((previous) => {
        if (previous !== 'REAL_MAP_READY_HIDDEN') {
          return previous;
        }
        return 'CROSSFADE';
      });
    });
    handoffTimerRef.current = window.setTimeout(() => {
      setHandoffState('REAL_MAP_VISIBLE');
      handoffTimerRef.current = null;
    }, MAP_CROSSFADE_DURATION_MS);
  }, [clearHandoffTimer]);

  useEffect(() => {
    return () => {
      clearHandoffTimer();
    };
  }, [clearHandoffTimer]);

  return {
    handoffState,
    resetHandoff,
    beginHandoff,
  };
}
