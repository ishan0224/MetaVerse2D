'use client';

import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui';
import {
  getVoiceControlState,
  setRemotePlayerMuted,
  setUIPushToTalkPressed,
  setVoiceMode,
  subscribeToVoiceControlState,
  type VoiceMode,
} from '@/lib/voiceControlStore';

const VOICE_MODES: VoiceMode[] = ['MUTED', 'PUSH_TO_TALK', 'ALWAYS_ON'];

export function VoiceControls() {
  const state = useSyncExternalStore(
    subscribeToVoiceControlState,
    getVoiceControlState,
    getVoiceControlState,
  );

  const pushToTalkActive = state.keyboardPushToTalkPressed || state.uiPushToTalkPressed;

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-white/20 bg-black/70 p-3 text-xs text-zinc-100 backdrop-blur-sm">
      <div className="mb-2 font-semibold">Voice Controls</div>
      <div className="mb-2 text-zinc-300">
        Press `M` to cycle modes (Muted, Push To Talk, Always On).
      </div>

      <div className="pointer-events-auto mb-3 flex flex-wrap gap-2">
        {VOICE_MODES.map((mode) => {
          const selected = state.mode === mode;
          return (
            <Button
              key={mode}
              onClick={() => {
                setVoiceMode(mode);
              }}
              variant={selected ? 'active' : 'secondary'}
              size="sm"
              className={`rounded border-transparent px-2 py-1 ${
                selected
                  ? 'bg-emerald-500 text-black hover:bg-emerald-500'
                  : 'bg-zinc-700 text-zinc-100 hover:bg-zinc-600'
              }`}
            >
              {formatMode(mode)}
            </Button>
          );
        })}
      </div>

      <div className="pointer-events-auto mb-3">
        <Button
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
          variant={pushToTalkActive ? 'active' : 'secondary'}
          className={`w-full border-transparent px-3 py-2 text-left ${
            pushToTalkActive ? 'bg-emerald-500 text-black hover:bg-emerald-500' : 'bg-zinc-700 hover:bg-zinc-600'
          }`}
        >
          Hold To Talk (UI) or press Space
        </Button>
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
              <Button
                onClick={() => {
                  setRemotePlayerMuted(player.id, !muted);
                }}
                variant="secondary"
                size="sm"
                className={`rounded border-transparent px-2 py-1 ${
                  muted ? 'bg-rose-500 text-black hover:bg-rose-500' : 'bg-zinc-700 hover:bg-zinc-600'
                }`}
              >
                {muted ? 'Unmute' : 'Mute'}
              </Button>
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
