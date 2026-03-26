export type VoiceMode = 'MUTED' | 'PUSH_TO_TALK' | 'ALWAYS_ON';

export type VoiceUIRemotePlayer = {
  id: string;
  name: string;
};

type VoiceControlState = {
  mode: VoiceMode;
  keyboardPushToTalkPressed: boolean;
  uiPushToTalkPressed: boolean;
  mutedRemotePlayerIds: Record<string, boolean>;
  remotePlayers: VoiceUIRemotePlayer[];
};

const DEFAULT_STATE: VoiceControlState = {
  mode: 'PUSH_TO_TALK',
  keyboardPushToTalkPressed: false,
  uiPushToTalkPressed: false,
  mutedRemotePlayerIds: {},
  remotePlayers: [],
};

let state: VoiceControlState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();

export function subscribeToVoiceControlState(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getVoiceControlState(): VoiceControlState {
  return state;
}

export function setVoiceMode(mode: VoiceMode): void {
  if (state.mode === mode) {
    return;
  }

  state = {
    ...state,
    mode,
  };
  emit();
}

export function cycleVoiceMode(): void {
  if (state.mode === 'MUTED') {
    setVoiceMode('PUSH_TO_TALK');
    return;
  }

  if (state.mode === 'PUSH_TO_TALK') {
    setVoiceMode('ALWAYS_ON');
    return;
  }

  setVoiceMode('MUTED');
}

export function toggleVoiceMuteMode(): void {
  cycleVoiceMode();
}

export function setKeyboardPushToTalkPressed(pressed: boolean): void {
  if (pressed && state.mode !== 'PUSH_TO_TALK') {
    setVoiceMode('PUSH_TO_TALK');
  }

  if (state.keyboardPushToTalkPressed === pressed) {
    return;
  }

  state = {
    ...state,
    keyboardPushToTalkPressed: pressed,
  };
  emit();
}

export function setUIPushToTalkPressed(pressed: boolean): void {
  if (pressed && state.mode !== 'PUSH_TO_TALK') {
    setVoiceMode('PUSH_TO_TALK');
  }

  if (state.uiPushToTalkPressed === pressed) {
    return;
  }

  state = {
    ...state,
    uiPushToTalkPressed: pressed,
  };
  emit();
}

export function setRemotePlayerMuted(playerId: string, muted: boolean): void {
  const current = Boolean(state.mutedRemotePlayerIds[playerId]);
  if (current === muted) {
    return;
  }

  state = {
    ...state,
    mutedRemotePlayerIds: {
      ...state.mutedRemotePlayerIds,
      [playerId]: muted,
    },
  };
  emit();
}

export function setVoiceUIRemotePlayers(players: VoiceUIRemotePlayer[]): void {
  const sortedPlayers = [...players].sort((left, right) => left.name.localeCompare(right.name));
  const nextIds = new Set(sortedPlayers.map((player) => player.id));

  let changed = sortedPlayers.length !== state.remotePlayers.length;
  if (!changed) {
    for (let index = 0; index < sortedPlayers.length; index += 1) {
      const current = state.remotePlayers[index];
      const next = sortedPlayers[index];
      if (current.id !== next.id || current.name !== next.name) {
        changed = true;
        break;
      }
    }
  }

  const nextMutedRemotePlayerIds: Record<string, boolean> = {};
  for (const [playerId, muted] of Object.entries(state.mutedRemotePlayerIds)) {
    if (nextIds.has(playerId)) {
      nextMutedRemotePlayerIds[playerId] = muted;
    }
  }

  const mutedMapChanged =
    Object.keys(nextMutedRemotePlayerIds).length !== Object.keys(state.mutedRemotePlayerIds).length ||
    Object.entries(nextMutedRemotePlayerIds).some(([playerId, muted]) => state.mutedRemotePlayerIds[playerId] !== muted);

  if (!changed && !mutedMapChanged) {
    return;
  }

  state = {
    ...state,
    remotePlayers: sortedPlayers,
    mutedRemotePlayerIds: nextMutedRemotePlayerIds,
  };
  emit();
}

export function resetVoiceControlState(): void {
  state = { ...DEFAULT_STATE };
  emit();
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}
