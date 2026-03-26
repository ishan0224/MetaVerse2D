'use client';

import { useEffect, useSyncExternalStore } from 'react';

import {
  cycleVoiceMode,
  getVoiceControlState,
  setKeyboardPushToTalkPressed,
  setRemotePlayerMuted,
  setUIPushToTalkPressed,
  setVoiceMode,
  subscribeToVoiceControlState,
  type VoiceMode,
} from '@/game/systems/voiceControlStore';

const VOICE_MODES: VoiceMode[] = ['MUTED', 'PUSH_TO_TALK', 'ALWAYS_ON'];

export function VoiceControls() {
  const state = useSyncExternalStore(
    subscribeToVoiceControlState,
    getVoiceControlState,
    getVoiceControlState,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event)) {
        return;
      }

      if (event.code === 'KeyM' && !event.repeat) {
        cycleVoiceMode();
        return;
      }

      if (event.code !== 'Space' || event.repeat) {
        return;
      }

      setKeyboardPushToTalkPressed(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      setKeyboardPushToTalkPressed(false);
    };

    const onWindowBlur = () => {
      setKeyboardPushToTalkPressed(false);
      setUIPushToTalkPressed(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  const pushToTalkActive = state.keyboardPushToTalkPressed || state.uiPushToTalkPressed;

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-white/20 bg-black/70 p-3 text-xs text-zinc-100 backdrop-blur-sm">
      <div className="mb-2 font-semibold">Voice Controls</div>
      <div className="mb-2 text-zinc-300">Press `M` to mute/unmute voice mode.</div>

      <div className="pointer-events-auto mb-3 flex flex-wrap gap-2">
        {VOICE_MODES.map((mode) => {
          const selected = state.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setVoiceMode(mode);
              }}
              className={`rounded px-2 py-1 ${
                selected
                  ? 'bg-emerald-500 text-black'
                  : 'bg-zinc-700 text-zinc-100 hover:bg-zinc-600'
              }`}
            >
              {formatMode(mode)}
            </button>
          );
        })}
      </div>

      <div className="pointer-events-auto mb-3">
        <button
          type="button"
          onMouseDown={() => {
            setUIPushToTalkPressed(true);
          }}
          onMouseUp={() => {
            setUIPushToTalkPressed(false);
          }}
          onMouseLeave={() => {
            setUIPushToTalkPressed(false);
          }}
          onTouchStart={() => {
            setUIPushToTalkPressed(true);
          }}
          onTouchEnd={() => {
            setUIPushToTalkPressed(false);
          }}
          onTouchCancel={() => {
            setUIPushToTalkPressed(false);
          }}
          className={`w-full rounded px-3 py-2 text-left ${
            pushToTalkActive ? 'bg-emerald-500 text-black' : 'bg-zinc-700 hover:bg-zinc-600'
          }`}
        >
          Hold To Talk (UI) or press Space
        </button>
      </div>

      <div className="space-y-1">
        <div className="font-medium">Remote Players</div>
        {state.remotePlayers.length === 0 ? (
          <div className="text-zinc-400">No remote players in room</div>
        ) : null}
        {state.remotePlayers.map((player) => {
          const muted = Boolean(state.mutedRemotePlayerIds[player.id]);
          return (
            <div
              key={player.id}
              className="pointer-events-auto flex items-center justify-between gap-2"
            >
              <span className="truncate">{player.name || player.id}</span>
              <button
                type="button"
                onClick={() => {
                  setRemotePlayerMuted(player.id, !muted);
                }}
                className={`rounded px-2 py-1 ${
                  muted ? 'bg-rose-500 text-black' : 'bg-zinc-700 hover:bg-zinc-600'
                }`}
              >
                {muted ? 'Unmute' : 'Mute'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatMode(mode: VoiceMode): string {
  switch (mode) {
    case 'MUTED':
      return 'Muted';
    case 'PUSH_TO_TALK':
      return 'Push To Talk';
    case 'ALWAYS_ON':
      return 'Always On';
  }
}

function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}
