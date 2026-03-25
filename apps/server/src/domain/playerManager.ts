import type { InputState, Player } from '@metaverse2d/shared';
import { getNextPosition, resolvePlayerCollisions } from '@metaverse2d/shared';

import { RoomManager } from './roomManager';
import { WORLD_BOUNDS } from './worldConfig';

const PLAYER_SPEED = 220;
const PLAYER_COLORS = [0x3b82f6, 0xf97316, 0x10b981, 0xeab308];
const PLAYER_COLLISION_DISTANCE = 28;
const PLAYER_MAX_PUSH_PER_UPDATE = 2.25;

export class PlayerManager {
  private readonly players = new Map<string, Player>();
  private readonly roomManager = new RoomManager();

  public addPlayer(id: string, name: string, roomId: string, spawnX: number, spawnY: number): Player {
    const playerIndex = this.getPlayersInRoom(roomId).length;
    const player: Player = {
      id,
      x: clamp(spawnX, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
      y: clamp(spawnY, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
      name,
      roomId,
      color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
    };

    this.players.set(id, player);
    this.roomManager.addPlayerToRoom(player, roomId);
    return player;
  }

  public removePlayer(id: string): string | null {
    const roomId = this.roomManager.removePlayerFromRoom(id);
    this.players.delete(id);
    return roomId;
  }

  public updatePlayer(id: string, input: InputState, delta: number): Player | null {
    const existingPlayer = this.players.get(id);
    if (!existingPlayer) {
      return null;
    }

    const nextPosition = getNextPosition({
      currentPosition: { x: existingPlayer.x, y: existingPlayer.y },
      input,
      deltaMs: delta,
      speed: PLAYER_SPEED,
      bounds: WORLD_BOUNDS,
    });

    const updatedPlayer: Player = {
      ...existingPlayer,
      x: nextPosition.x,
      y: nextPosition.y,
    };

    this.players.set(id, updatedPlayer);
    this.resolveCollisions(existingPlayer.roomId);

    return this.players.get(id) ?? null;
  }

  public createRoom(roomId: string): void {
    this.roomManager.createRoom(roomId);
  }

  public getPlayersInRoom(roomId: string): Player[] {
    const playerIds = this.roomManager.getPlayersInRoom(roomId);
    return playerIds
      .map((playerId) => this.players.get(playerId))
      .filter((player): player is Player => Boolean(player));
  }

  public getPlayerRoomId(playerId: string): string | null {
    return this.roomManager.getRoomForPlayer(playerId);
  }

  private resolveCollisions(roomId: string): void {
    const roomPlayers = this.getPlayersInRoom(roomId);
    const resolvedPlayers = resolvePlayerCollisions(roomPlayers, {
      minDistance: PLAYER_COLLISION_DISTANCE,
      maxPushPerUpdate: PLAYER_MAX_PUSH_PER_UPDATE,
    });

    for (const resolvedPlayer of resolvedPlayers) {
      const existingPlayer = this.players.get(resolvedPlayer.id);
      if (!existingPlayer) {
        continue;
      }

      this.players.set(resolvedPlayer.id, {
        ...existingPlayer,
        x: clamp(resolvedPlayer.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
        y: clamp(resolvedPlayer.y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
      });
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
