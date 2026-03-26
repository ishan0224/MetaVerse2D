import type { InputState } from '@metaverse2d/shared/types/InputState';

import { getClientPlayerId, getRoomId, listenToPlayerUpdates, sendInput } from '@/network';

type PlayerSnapshot = {
  id: string;
  x: number;
  y: number;
  name: string;
  color: number;
  roomId: string;
  avatarUrl?: string;
  timestamp: number;
};

type PlayersUpdatePayload = {
  players: Array<{
    id: string;
    x: number;
    y: number;
    name: string;
    color: number;
    roomId: string;
    avatarUrl?: string;
    timestamp?: number;
  }>;
  proximity: Record<string, string[]>;
};

export class MultiplayerSystem {
  private unsubscribe: (() => void) | null = null;
  private localPlayer: PlayerSnapshot | null = null;
  private readonly remotePlayers = new Map<string, PlayerSnapshot>();
  private proximityByPlayerId: Record<string, string[]> = {};
  private activeRoomId: string | null = null;

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

  public getNearbyPlayerIds(playerId: string): string[] {
    return [...(this.proximityByPlayerId[playerId] ?? [])];
  }

  public getLocalNearbyPlayerIds(): string[] {
    if (!this.localPlayer) {
      return [];
    }

    return this.getNearbyPlayerIds(this.localPlayer.id);
  }

  private handlePlayersUpdate(payload: PlayersUpdatePayload): void {
    const clientPlayerId = getClientPlayerId();
    const selectedRoomId = getRoomId();
    if (this.activeRoomId !== selectedRoomId) {
      this.localPlayer = null;
      this.remotePlayers.clear();
      this.proximityByPlayerId = {};
      this.activeRoomId = selectedRoomId;
    }

    const fallbackTimestamp = performance.now();
    this.localPlayer = null;
    this.remotePlayers.clear();
    this.proximityByPlayerId = {};

    for (const player of payload.players) {
      if (selectedRoomId && player.roomId !== selectedRoomId) {
        continue;
      }

      const snapshotTimestamp = typeof player.timestamp === 'number' ? player.timestamp : fallbackTimestamp;
      const nextSnapshot: PlayerSnapshot = {
        ...player,
        timestamp: snapshotTimestamp,
      };

      if (clientPlayerId && player.id === clientPlayerId) {
        this.localPlayer = nextSnapshot;
        this.proximityByPlayerId[player.id] = [...(payload.proximity[player.id] ?? [])];
        continue;
      }

      this.remotePlayers.set(player.id, nextSnapshot);
      this.proximityByPlayerId[player.id] = [...(payload.proximity[player.id] ?? [])];
    }
  }
}
