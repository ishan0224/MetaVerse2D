'use client';

import { type CSSProperties, useSyncExternalStore } from 'react';

import { getRuntimeUiState, subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';

type JoinStatusOverlayProps = {
  touchOptimized?: boolean;
};

export function JoinStatusOverlay({ touchOptimized = false }: JoinStatusOverlayProps) {
  const state = useSyncExternalStore(subscribeToRuntimeUiState, getRuntimeUiState, getRuntimeUiState);
  if (state.joinUiPhase === 'READY') {
    return null;
  }

  const containerStyle: CSSProperties | undefined = touchOptimized
    ? {
        paddingTop: 'max(0px, env(safe-area-inset-top))',
        paddingRight: 'max(0px, env(safe-area-inset-right))',
        paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0px, env(safe-area-inset-left))',
      }
    : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4" style={containerStyle}>
      <div className={`ui-flow-box w-full max-w-md text-center text-zinc-100 ${touchOptimized ? 'px-6 py-5' : 'px-5 py-4'}`}>
        <div className={touchOptimized ? 'text-base font-semibold' : 'text-sm font-semibold sm:text-base'}>
          {getJoinStatusMessage(state.joinUiPhase)}
        </div>
      </div>
    </div>
  );
}

function getJoinStatusMessage(phase: ReturnType<typeof getRuntimeUiState>['joinUiPhase']): string {
  switch (phase) {
    case 'CONNECTING':
      return 'Connecting...';
    case 'JOINING_ROOM':
      return 'Joining room...';
    case 'REQUESTING_MIC':
      return 'Requesting microphone...';
    case 'RECONNECTING':
      return 'Disconnected. Reconnecting...';
    case 'MIC_BLOCKED':
      return 'Microphone blocked';
    case 'CONNECT_FAILED':
      return 'Failed to connect';
    case 'READY':
      return '';
  }
}
