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

type RuntimeUiState = {
  playerName: string;
  roomId: string;
  roomPopulation: number;
  avatarUrl: string | null;
  playerColor: number;
  joinUiPhase: JoinUiPhase;
  socketStatus: SocketUiStatus;
  micPermissionStatus: MicPermissionStatus;
};

const DEFAULT_STATE: RuntimeUiState = {
  playerName: '',
  roomId: '',
  roomPopulation: 1,
  avatarUrl: null,
  playerColor: 0x3b82f6,
  joinUiPhase: 'CONNECTING',
  socketStatus: 'CONNECTING',
  micPermissionStatus: 'IDLE',
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

export function setRuntimeAvatar(avatarUrl: string | null, playerColor: number): void {
  if (state.avatarUrl === avatarUrl && state.playerColor === playerColor) {
    return;
  }

  state = {
    ...state,
    avatarUrl,
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

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}
