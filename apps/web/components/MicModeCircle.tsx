'use client';

import { useSyncExternalStore } from 'react';

import { getVoiceControlState, subscribeToVoiceControlState } from '@/game/systems/voiceControlStore';

export function MicModeCircle() {
  const voiceState = useSyncExternalStore(
    subscribeToVoiceControlState,
    getVoiceControlState,
    getVoiceControlState,
  );

  const pushToTalkActive =
    voiceState.mode === 'PUSH_TO_TALK' &&
    (voiceState.keyboardPushToTalkPressed || voiceState.uiPushToTalkPressed);

  return (
    <div className="pointer-events-none absolute bottom-4 right-3 z-20 sm:bottom-5 sm:right-4">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full border border-black/20 bg-white/95 text-zinc-900 shadow-md backdrop-blur transition-transform duration-150 ease-out sm:h-12 sm:w-12 ${
          pushToTalkActive ? '-translate-y-1.5' : 'translate-y-0'
        }`}
        aria-label={getAriaLabel(voiceState.mode)}
      >
        {voiceState.mode === 'MUTED' ? <MutedMicIcon /> : null}
        {voiceState.mode === 'ALWAYS_ON' ? <MicIcon /> : null}
        {voiceState.mode === 'PUSH_TO_TALK' ? <WalkieTalkieIcon /> : null}
      </div>
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
