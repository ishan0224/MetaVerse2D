'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { Joystick } from '@/components/Joystick';
import {
  cycleVoiceMode,
  getVoiceControlState,
  setUIPushToTalkPressed,
  subscribeToVoiceControlState,
  type VoiceMode,
} from '@/game/systems/voiceControlStore';
import { resetInactivityTimer } from '@/lib/inactivityUiStore';
import { resetMovementInput } from '@/store/useInputStore';

export function TouchGameplayControls() {
  const voiceState = useSyncExternalStore(
    subscribeToVoiceControlState,
    getVoiceControlState,
    getVoiceControlState,
  );
  const pushToTalkActive =
    voiceState.mode === 'PUSH_TO_TALK' &&
    (voiceState.keyboardPushToTalkPressed || voiceState.uiPushToTalkPressed);

  useEffect(() => {
    return () => {
      resetMovementInput();
      setUIPushToTalkPressed(false);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 gameplay-safe-area">
      <Joystick />

      <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col items-end gap-2 sm:bottom-4 sm:right-4">
        <button
          type="button"
          onClick={() => {
            cycleVoiceMode();
            resetInactivityTimer('manual-presence');
          }}
          className="min-h-11 min-w-[118px] rounded-xl border border-white/30 bg-black/55 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-100 shadow-md backdrop-blur"
        >
          Voice: {formatVoiceMode(voiceState.mode)}
        </button>
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            resetInactivityTimer('ptt');
            setUIPushToTalkPressed(true);
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            setUIPushToTalkPressed(false);
          }}
          onPointerCancel={() => {
            setUIPushToTalkPressed(false);
          }}
          onPointerLeave={() => {
            setUIPushToTalkPressed(false);
          }}
          className={`min-h-11 min-w-[132px] rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] shadow-md backdrop-blur transition-colors duration-100 ease-out ${
            pushToTalkActive
              ? 'border-emerald-300/90 bg-emerald-400/40 text-emerald-50'
              : 'border-white/30 bg-black/55 text-zinc-100'
          }`}
        >
          Hold To Talk
        </button>
      </div>
    </div>
  );
}

function formatVoiceMode(mode: VoiceMode): string {
  switch (mode) {
    case 'MUTED':
      return 'Muted';
    case 'PUSH_TO_TALK':
      return 'PTT';
    case 'ALWAYS_ON':
      return 'Always';
  }
}
