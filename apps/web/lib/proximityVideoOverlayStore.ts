export type ProximityVideoOverlayPlayer = {
  id: string;
  name: string;
  screenX: number;
  screenY: number;
  distance: number;
};

type ProximityVideoOverlayState = {
  players: ProximityVideoOverlayPlayer[];
  updatedAtMs: number;
};

const DEFAULT_STATE: ProximityVideoOverlayState = {
  players: [],
  updatedAtMs: 0,
};

let state: ProximityVideoOverlayState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();

export function subscribeToProximityVideoOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProximityVideoOverlayState(): ProximityVideoOverlayState {
  return state;
}

export function setProximityVideoOverlayPlayers(players: ProximityVideoOverlayPlayer[]): void {
  state = {
    players,
    updatedAtMs: Date.now(),
  };
  emit();
}

export function resetProximityVideoOverlayState(): void {
  state = { ...DEFAULT_STATE };
  emit();
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}
