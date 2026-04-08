'use client';

import { useSyncExternalStore } from 'react';

import { HudCircle } from '@/components/ui';
import { ENABLE_TEST_MINIMAP } from '@/config/features';
import { numberToHexColor } from '@/lib/colorUtils';
import { getRuntimeUiState, subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';

export function BottomAvatarCircle() {
  const state = useSyncExternalStore(subscribeToRuntimeUiState, getRuntimeUiState, getRuntimeUiState);
  const positionClass = ENABLE_TEST_MINIMAP
    ? 'bottom-4 right-[164px] sm:bottom-5 sm:right-[166px]'
    : 'bottom-4 right-3 sm:bottom-5 sm:right-4';

  return (
    <div className={`pointer-events-none absolute z-20 ${positionClass}`}>
      <HudCircle size="sm">
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
      </HudCircle>
    </div>
  );
}
