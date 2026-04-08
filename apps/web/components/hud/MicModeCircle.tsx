'use client';

import { useSyncExternalStore } from 'react';

import { HudCircle } from '@/components/ui';
import { getVoiceControlState, subscribeToVoiceControlState } from '@/lib/voiceControlStore';

type MicModeCircleProps = {
  placement?: 'bottom-right' | 'top-right-below';
  touchOptimized?: boolean;
};

export function MicModeCircle({
  placement = 'bottom-right',
  touchOptimized = false,
}: MicModeCircleProps) {
  const voiceState = useSyncExternalStore(
    subscribeToVoiceControlState,
    getVoiceControlState,
    getVoiceControlState,
  );

  const pushToTalkActive =
    voiceState.mode === 'PUSH_TO_TALK' &&
    (voiceState.keyboardPushToTalkPressed || voiceState.uiPushToTalkPressed);

  const safeAreaStyle = touchOptimized
    ? {
        paddingRight: 'max(0px, env(safe-area-inset-right))',
        paddingTop: 'max(0px, env(safe-area-inset-top))',
        paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
      }
    : undefined;
  const circleElement = (
    <HudCircle
      size={touchOptimized ? 'lg' : 'sm'}
      ariaLabel={getAriaLabel(voiceState.mode)}
      className={`transition-transform duration-150 ease-out ${
        pushToTalkActive ? '-translate-y-1.5' : 'translate-y-0'
      }`}
    >
      {voiceState.mode === 'MUTED' ? <MutedMicIcon /> : null}
      {voiceState.mode === 'ALWAYS_ON' ? <MicIcon /> : null}
      {voiceState.mode === 'PUSH_TO_TALK' ? <WalkieTalkieIcon /> : null}
    </HudCircle>
  );

  if (placement === 'top-right-below') {
    return (
      <div
        className={`pointer-events-none absolute z-20 ${touchOptimized ? 'right-2 top-20' : 'right-3 top-16 sm:right-4 sm:top-[4.5rem]'}`}
        style={safeAreaStyle}
      >
        {circleElement}
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute z-20 ${touchOptimized ? 'bottom-3 right-2' : 'bottom-4 right-3 sm:bottom-5 sm:right-4'}`}
      style={safeAreaStyle}
    >
      {circleElement}
    </div>
  );
}

function getAriaLabel(mode: ReturnType<typeof getVoiceControlState>['mode']): string {
  switch (mode) {
    case 'MUTED':
      return 'Voice muted';
    case 'ALWAYS_ON':
      return 'Voice always on';
    case 'PUSH_TO_TALK':
      return 'Push to talk mode';
  }
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-600" fill="none" aria-hidden="true">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MutedMicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-600" fill="none" aria-hidden="true">
      <path d="M12 3a3 3 0 0 0-3 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 12a3 3 0 0 0 6 0v-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 11a6 6 0 0 0 9.2 5.1M12 17v4M9 21h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m4 4 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function WalkieTalkieIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-600" fill="none" aria-hidden="true">
      <rect x="8" y="7" width="8" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7V4m-2 6h4m-2 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 9h2M16 9h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
