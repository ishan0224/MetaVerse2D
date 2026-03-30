import type { InputState } from '@metaverse2d/shared/types/InputState';

import {
  getClientPlayerId,
  getRoomId,
  getWorldId,
  listenToPlayerUpdates,
  setRoomId,
  setWorldId,
} from '@/network';
import { MovementSyncEmitter } from '@/network/movementSync';

type PlayerSnapshot = {
  id: string;
  x: number;
  y: number;
  name: string;
  worldId: string;
  color: number;
  roomId: string;
  avatarId?: number;
  avatarUrl?: string;
  timestamp: number;
};

type PlayersUpdatePayload = {
  players: Array<{
    id: string;
    x: number;
    y: number;
    name: string;
    worldId: string;
    color: number;
    roomId: string;
    avatarId?: number;
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
  private activeScopeId: string | null = null;
  private readonly movementSyncEmitter = new MovementSyncEmitter();

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
    this.movementSyncEmitter.reset();
  }

  public pushInput(input: InputState, delta: number): void {
    this.movementSyncEmitter.pushInput(input, delta);
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
    const authoritativeLocalPlayer = clientPlayerId
      ? payload.players.find((player) => player.id === clientPlayerId)
      : undefined;
    if (authoritativeLocalPlayer) {
      if (authoritativeLocalPlayer.worldId !== getWorldId()) {
        setWorldId(authoritativeLocalPlayer.worldId);
      }

      if (authoritativeLocalPlayer.roomId !== getRoomId()) {
        setRoomId(authoritativeLocalPlayer.roomId);
      }
    }

    const selectedWorldId = getWorldId();
    const selectedRoomId = getRoomId();
    const selectedScopeId = selectedWorldId && selectedRoomId ? `${selectedWorldId}::${selectedRoomId}` : null;
    if (this.activeScopeId !== selectedScopeId) {
      this.localPlayer = null;
      this.remotePlayers.clear();
      this.proximityByPlayerId = {};
      this.activeScopeId = selectedScopeId;
    }

    this.localPlayer = null;
    this.remotePlayers.clear();
    this.proximityByPlayerId = {};

    for (const player of payload.players) {
      if (selectedWorldId && player.worldId !== selectedWorldId) {
        continue;
      }

      if (selectedRoomId && player.roomId !== selectedRoomId) {
        continue;
      }

      // Interpolation in the web client uses performance.now().
      // Timestamp snapshots on client receipt to keep time domains consistent.
      const snapshotTimestamp = performance.now();
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
