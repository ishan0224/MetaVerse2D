import type { InputState } from '@metaverse2d/shared/types/InputState';

import { getClientPlayerId, listenToPlayerUpdates, sendInput } from '@/network';

type PlayerSnapshot = {
  id: string;
  x: number;
  y: number;
  name: string;
  color: number;
  timestamp: number;
};

type PlayersUpdatePayload = {
  players: Array<{
    id: string;
    x: number;
    y: number;
    name: string;
    color: number;
    timestamp?: number;
  }>;
};

export class MultiplayerSystem {
  private unsubscribe: (() => void) | null = null;
  private localPlayer: PlayerSnapshot | null = null;
  private readonly remotePlayers = new Map<string, PlayerSnapshot>();

  public start(): void {
    this.unsubscribe = listenToPlayerUpdates((payload) => {
      this.handlePlayersUpdate(payload);
    });
  }

  public stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  public pushInput(input: InputState, delta: number): void {
    sendInput(input, delta);
  }

  public getLocalPlayer(): PlayerSnapshot | null {
    return this.localPlayer ? { ...this.localPlayer } : null;
  }

  public getRemotePlayers(): PlayerSnapshot[] {
    return Array.from(this.remotePlayers.values()).map((player) => ({ ...player }));
  }

  private handlePlayersUpdate(payload: PlayersUpdatePayload): void {
    const clientPlayerId = getClientPlayerId();
    const fallbackTimestamp = performance.now();
    this.localPlayer = null;
    this.remotePlayers.clear();

    for (const player of payload.players) {
      const snapshotTimestamp = typeof player.timestamp === 'number' ? player.timestamp : fallbackTimestamp;
      const nextSnapshot: PlayerSnapshot = {
        ...player,
        timestamp: snapshotTimestamp,
      };

      if (clientPlayerId && player.id === clientPlayerId) {
        this.localPlayer = nextSnapshot;
        continue;
      }

      this.remotePlayers.set(player.id, nextSnapshot);
    }
  }
}
