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

let state: RuntimeUiState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();

export function subscribeToRuntimeUiState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRuntimeUiState(): RuntimeUiState {
  return state;
}

export function resetRuntimeUiState(): void {
  state = { ...DEFAULT_STATE };
  emit();
}

export function setRuntimeIdentity(playerName: string, roomId: string): void {
  if (state.playerName === playerName && state.roomId === roomId) {
    return;
  }

  state = {
    ...state,
    playerName,
    roomId,
  };
  emit();
}

export function setRoomPopulation(roomPopulation: number): void {
  const nextPopulation = Math.max(0, roomPopulation);
  if (state.roomPopulation === nextPopulation) {
    return;
  }

  state = {
    ...state,
    roomPopulation: nextPopulation,
  };
  emit();
}

export function setRuntimeAvatar(
  avatarUrl: string | null,
  playerColor: number,
  avatarId: number | null,
): void {
  const normalizedAvatarId =
    typeof avatarId === 'number' && Number.isFinite(avatarId) ? Math.round(avatarId) : null;
  if (
    state.avatarUrl === avatarUrl &&
    state.playerColor === playerColor &&
    state.avatarId === normalizedAvatarId
  ) {
    return;
  }

  state = {
    ...state,
    avatarUrl,
    avatarId: normalizedAvatarId,
    playerColor,
  };
  emit();
}

export function setJoinUiPhase(joinUiPhase: JoinUiPhase): void {
  if (state.joinUiPhase === joinUiPhase) {
    return;
  }

  state = {
    ...state,
    joinUiPhase,
  };
  emit();
}

export function setSocketUiStatus(socketStatus: SocketUiStatus): void {
  if (state.socketStatus === socketStatus) {
    return;
  }

  state = {
    ...state,
    socketStatus,
  };
  emit();
}

export function setMicPermissionStatus(micPermissionStatus: MicPermissionStatus): void {
  if (state.micPermissionStatus === micPermissionStatus) {
    return;
  }

  state = {
    ...state,
    micPermissionStatus,
  };
  emit();
}

export function setMinimapSnapshot(minimap: MinimapSnapshot): void {
  state = {
    ...state,
    minimap,
  };
  emit();
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}
