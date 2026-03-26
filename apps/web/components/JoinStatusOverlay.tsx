'use client';

import { useSyncExternalStore } from 'react';

import { getRuntimeUiState, subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';

export function JoinStatusOverlay() {
  const state = useSyncExternalStore(subscribeToRuntimeUiState, getRuntimeUiState, getRuntimeUiState);
  if (state.joinUiPhase === 'READY') {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/30 bg-black/75 px-5 py-4 text-center text-zinc-100 shadow-2xl backdrop-blur-md">
        <div className="text-sm font-semibold sm:text-base">{getJoinStatusMessage(state.joinUiPhase)}</div>
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
