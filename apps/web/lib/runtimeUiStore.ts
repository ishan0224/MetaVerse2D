import { createObservableStore } from '@/lib/createObservableStore';

export type JoinUiPhase =
  | 'CONNECTING'
  | 'JOINING_ROOM'
  | 'REQUESTING_MIC'
  | 'RECONNECTING'
  | 'MIC_BLOCKED'
  | 'CONNECT_FAILED'
  | 'READY';

export type SocketUiStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'FAILED';

export type MicPermissionStatus = 'IDLE' | 'REQUESTING' | 'GRANTED' | 'BLOCKED';

export type MinimapMarker = {
  id: string;
  x: number;
  y: number;
  color: number;
};

export type MinimapSnapshot = {
  worldId: string;
  roomId: string;
  localPlayerId: string | null;
  worldWidth: number;
  worldHeight: number;
  players: MinimapMarker[];
};

type RuntimeUiState = {
  playerName: string;
  roomId: string;
  roomPopulation: number;
  avatarUrl: string | null;
  avatarId: number | null;
  playerColor: number;
  joinUiPhase: JoinUiPhase;
  socketStatus: SocketUiStatus;
  micPermissionStatus: MicPermissionStatus;
  minimap: MinimapSnapshot;
};

const DEFAULT_STATE: RuntimeUiState = {
  playerName: '',
  roomId: '',
  roomPopulation: 1,
  avatarUrl: null,
  avatarId: 1,
  playerColor: 0x3b82f6,
  joinUiPhase: 'CONNECTING',
  socketStatus: 'CONNECTING',
  micPermissionStatus: 'IDLE',
  minimap: {
    worldId: '1',
    roomId: '1',
    localPlayerId: null,
    worldWidth: 2400,
    worldHeight: 1600,
    players: [],
  },
};

const store = createObservableStore(DEFAULT_STATE);

export function subscribeToRuntimeUiState(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function getRuntimeUiState(): RuntimeUiState {
  return store.getState();
}

export function resetRuntimeUiState(): void {
  store.reset();
}

export function setRuntimeIdentity(playerName: string, roomId: string): void {
  const state = store.getState();
  if (state.playerName === playerName && state.roomId === roomId) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    playerName,
    roomId,
  }));
}

export function setRoomPopulation(roomPopulation: number): void {
  const state = store.getState();
  const nextPopulation = Math.max(0, roomPopulation);
  if (state.roomPopulation === nextPopulation) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    roomPopulation: nextPopulation,
  }));
}

export function setRuntimeAvatar(
  avatarUrl: string | null,
  playerColor: number,
  avatarId: number | null,
): void {
  const state = store.getState();
  const normalizedAvatarId =
    typeof avatarId === 'number' && Number.isFinite(avatarId) ? Math.round(avatarId) : null;
  if (
    state.avatarUrl === avatarUrl &&
    state.playerColor === playerColor &&
    state.avatarId === normalizedAvatarId
  ) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    avatarUrl,
    avatarId: normalizedAvatarId,
    playerColor,
  }));
}

export function setJoinUiPhase(joinUiPhase: JoinUiPhase): void {
  const state = store.getState();
  if (state.joinUiPhase === joinUiPhase) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    joinUiPhase,
  }));
}

export function setSocketUiStatus(socketStatus: SocketUiStatus): void {
  const state = store.getState();
  if (state.socketStatus === socketStatus) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    socketStatus,
  }));
}

export function setMicPermissionStatus(micPermissionStatus: MicPermissionStatus): void {
  const state = store.getState();
  if (state.micPermissionStatus === micPermissionStatus) {
    return;
  }

  store.setState((previous) => ({
    ...previous,
    micPermissionStatus,
  }));
}

export function setMinimapSnapshot(minimap: MinimapSnapshot): void {
  store.setState((previous) => ({
    ...previous,
    minimap,
  }));
}
