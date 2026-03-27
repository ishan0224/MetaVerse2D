'use client';

import { useSyncExternalStore } from 'react';

import { ENABLE_TEST_MINIMAP } from '@/config/features';
import { getRuntimeUiState, subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';

export function BottomAvatarCircle() {
  const state = useSyncExternalStore(subscribeToRuntimeUiState, getRuntimeUiState, getRuntimeUiState);
  const positionClass = ENABLE_TEST_MINIMAP
    ? 'bottom-4 right-[164px] sm:bottom-5 sm:right-[166px]'
    : 'bottom-4 right-3 sm:bottom-5 sm:right-4';

  return (
    <div className={`pointer-events-none absolute z-20 ${positionClass}`}>
      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-black/60 shadow-md backdrop-blur sm:h-12 sm:w-12">
        {state.avatarUrl ? (
          <img
            src={state.avatarUrl}
            alt="Player avatar"
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-transparent">
            <div
              className="h-5 w-5 rounded-sm"
              style={{
                backgroundColor: numberToHexColor(state.playerColor),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function numberToHexColor(color: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, color >>> 0));
  return `#${clamped.toString(16).padStart(6, '0')}`;
}
