'use client';

import { type CSSProperties, useEffect, useState, useSyncExternalStore } from 'react';

import {
  getRuntimeUiState,
  type JoinUiPhase,
  subscribeToRuntimeUiState,
} from '@/lib/runtimeUiStore';

type JoinStatusOverlayProps = {
  touchOptimized?: boolean;
};

const HINT_VISIBLE_JOIN_PHASES: ReadonlySet<JoinUiPhase> = new Set([
  'CONNECTING',
  'JOINING_ROOM',
  'REQUESTING_MIC',
  'RECONNECTING',
]);

const DESKTOP_KEYBOARD_JOIN_HINT = 'Press M to cycle mic mode · Hold Space for push-to-talk';
const CONNECTING_DOT_FRAMES = ['', '.', '..', '...'] as const;
const CONNECTING_DOT_INTERVAL_MS = 500;

export function JoinStatusOverlay({ touchOptimized = false }: JoinStatusOverlayProps) {
  const state = useSyncExternalStore(subscribeToRuntimeUiState, getRuntimeUiState, getRuntimeUiState);
  const [connectingDotFrameIndex, setConnectingDotFrameIndex] = useState(0);

  useEffect(() => {
    if (state.joinUiPhase !== 'CONNECTING') {
      setConnectingDotFrameIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setConnectingDotFrameIndex(
        (currentIndex) => (currentIndex + 1) % CONNECTING_DOT_FRAMES.length,
      );
    }, CONNECTING_DOT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [state.joinUiPhase]);

  if (state.joinUiPhase === 'READY') {
    return null;
  }

  const keyboardHint = getJoinKeyboardHint(state.joinUiPhase, touchOptimized);
  const primaryStatusMessage = getJoinStatusMessage(
    state.joinUiPhase,
    CONNECTING_DOT_FRAMES[connectingDotFrameIndex],
  );
  const primaryStatusStyle: CSSProperties | undefined =
    state.joinUiPhase === 'CONNECTING' ? { fontSize: '1.25em' } : undefined;

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
        <div
          className={touchOptimized ? 'text-base font-semibold' : 'text-sm font-semibold sm:text-base'}
          style={primaryStatusStyle}
        >
          {primaryStatusMessage}
        </div>
        {keyboardHint ? (
          <p className="mt-2 text-xs text-zinc-300/90 sm:text-sm">{keyboardHint}</p>
        ) : null}
      </div>
    </div>
  );
}

function getJoinKeyboardHint(phase: JoinUiPhase, touchOptimized: boolean): string | null {
  if (touchOptimized || !HINT_VISIBLE_JOIN_PHASES.has(phase)) {
    return null;
  }

  return DESKTOP_KEYBOARD_JOIN_HINT;
}

function getJoinStatusMessage(
  phase: ReturnType<typeof getRuntimeUiState>['joinUiPhase'],
  connectingDots: (typeof CONNECTING_DOT_FRAMES)[number],
): string {
  switch (phase) {
    case 'CONNECTING':
      return `Connecting${connectingDots}`;
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
