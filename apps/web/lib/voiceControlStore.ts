import { createObservableStore } from '@/lib/createObservableStore';

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

const store = createObservableStore(DEFAULT_STATE);

export function subscribeToVoiceControlState(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function getVoiceControlState(): VoiceControlState {
  return store.getState();
}

export function setVoiceMode(mode: VoiceMode): void {
  const state = store.getState();
  if (state.mode === mode) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    mode,
  }));
}

export function cycleVoiceMode(): void {
  const state = store.getState();
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
  const state = store.getState();
  if (pressed && state.mode !== 'PUSH_TO_TALK') {
    setVoiceMode('PUSH_TO_TALK');
  }

  if (state.keyboardPushToTalkPressed === pressed) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    keyboardPushToTalkPressed: pressed,
  }));
}

export function setUIPushToTalkPressed(pressed: boolean): void {
  const state = store.getState();
  if (pressed && state.mode !== 'PUSH_TO_TALK') {
    setVoiceMode('PUSH_TO_TALK');
  }

  if (state.uiPushToTalkPressed === pressed) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    uiPushToTalkPressed: pressed,
  }));
}

export function setRemotePlayerMuted(playerId: string, muted: boolean): void {
  const state = store.getState();
  const current = Boolean(state.mutedRemotePlayerIds[playerId]);
  if (current === muted) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    mutedRemotePlayerIds: {
      ...previous.mutedRemotePlayerIds,
      [playerId]: muted,
    },
  }));
}

export function setVoiceUIRemotePlayers(players: VoiceUIRemotePlayer[]): void {
  const state = store.getState();
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

  store.setState((previous) => ({
    ...previous,
    remotePlayers: sortedPlayers,
    mutedRemotePlayerIds: nextMutedRemotePlayerIds,
  }));
}

export function resetVoiceControlState(): void {
  store.reset();
}
