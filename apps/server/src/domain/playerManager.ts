/** @module apps/server/src/domain/playerManager.ts */

import type { InputState, Player } from '@metaverse2d/shared';
import {
  getNextPosition,
  isStaticCollisionAtPosition,
  resolvePlayerCollisions,
  resolveStaticCollisions,
} from '@metaverse2d/shared';

import { RoomManager } from './roomManager';
import { STATIC_COLLISION_INDEX } from './staticCollisionMap';
import { WORLD_BOUNDS } from './worldConfig';

const PLAYER_SPEED = 135;
const PLAYER_COLORS = [0x3b82f6, 0xf97316, 0x10b981, 0xeab308];
const PLAYER_COLLISION_DISTANCE = 28;
const PLAYER_MAX_PUSH_PER_UPDATE = 2.25;
const PLAYER_STATIC_COLLIDER_SIZE = 26;
const SPAWN_SEARCH_STEP = 16;

export class PlayerManager {
  private readonly players = new Map<string, Player>();
  private readonly roomManager = new RoomManager();

  public addPlayer(
    id: string,
    name: string,
    worldId: string,
    roomId: string,
    spawnX: number,
    spawnY: number,
    avatarId?: number,
    avatarUrl?: string,
  ): Player {
    const scopeId = buildScopeId(worldId, roomId);
    const playerIndex = this.getPlayersInScope(scopeId).length;
    const resolvedSpawnPosition = this.resolveSpawnPosition({
      x: clamp(spawnX, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
      y: clamp(spawnY, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
    });
    const player: Player = {
      id,
      x: resolvedSpawnPosition.x,
      y: resolvedSpawnPosition.y,
      name,
      worldId,
      roomId,
      color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
      avatarId,
      avatarUrl,
    };

    this.players.set(id, player);
    this.roomManager.addPlayerToRoom(player, scopeId);
    return player;
  }

  public removePlayer(id: string): string | null {
    const roomId = this.roomManager.removePlayerFromRoom(id);
    this.players.delete(id);
    return roomId;
  }

  public getPlayer(id: string): Player | null {
    return this.players.get(id) ?? null;
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
    const resolvedStaticPosition = resolveStaticCollisions({
      currentPosition: { x: existingPlayer.x, y: existingPlayer.y },
      intendedPosition: nextPosition,
      playerSize: PLAYER_STATIC_COLLIDER_SIZE,
      collisionIndex: STATIC_COLLISION_INDEX,
    });

    const updatedPlayer: Player = {
      ...existingPlayer,
      x: resolvedStaticPosition.x,
      y: resolvedStaticPosition.y,
    };

    this.players.set(id, updatedPlayer);
    this.resolveCollisions(buildScopeId(existingPlayer.worldId, existingPlayer.roomId));

    return this.players.get(id) ?? null;
  }

  public createScope(scopeId: string): void {
    this.roomManager.createRoom(scopeId);
  }

  public getPlayersInScope(scopeId: string): Player[] {
    const playerIds = this.roomManager.getPlayersInRoom(scopeId);
    return playerIds
      .map((playerId) => this.players.get(playerId))
      .filter((player): player is Player => Boolean(player));
  }

  public getPlayerScopeId(playerId: string): string | null {
    return this.roomManager.getRoomForPlayer(playerId);
  }

  public getAllScopeIds(): string[] {
    return this.roomManager.getAllRoomIds();
  }

  private resolveCollisions(scopeId: string): void {
    const roomPlayers = this.getPlayersInScope(scopeId);
    const resolvedPlayers = resolvePlayerCollisions(roomPlayers, {
      minDistance: PLAYER_COLLISION_DISTANCE,
      maxPushPerUpdate: PLAYER_MAX_PUSH_PER_UPDATE,
    });

    for (const resolvedPlayer of resolvedPlayers) {
      const existingPlayer = this.players.get(resolvedPlayer.id);
      if (!existingPlayer) {
        continue;
      }

      const boundedPosition = {
        x: clamp(resolvedPlayer.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
        y: clamp(resolvedPlayer.y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
      };
      const staticResolvedPosition = resolveStaticCollisions({
        currentPosition: { x: existingPlayer.x, y: existingPlayer.y },
        intendedPosition: boundedPosition,
        playerSize: PLAYER_STATIC_COLLIDER_SIZE,
        collisionIndex: STATIC_COLLISION_INDEX,
      });

      this.players.set(resolvedPlayer.id, {
        ...existingPlayer,
        x: clamp(staticResolvedPosition.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
        y: clamp(staticResolvedPosition.y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
      });
    }
  }

  private resolveSpawnPosition(initialPosition: { x: number; y: number }): { x: number; y: number } {
    if (!this.isPositionBlocked(initialPosition)) {
      return initialPosition;
    }

    const maxSearchRadius = Math.max(
      WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX,
      WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY,
    );
    for (let radius = SPAWN_SEARCH_STEP; radius <= maxSearchRadius; radius += SPAWN_SEARCH_STEP) {
      for (let offsetY = -radius; offsetY <= radius; offsetY += SPAWN_SEARCH_STEP) {
        const leftCandidate = this.clampToWorldBounds({
          x: initialPosition.x - radius,
          y: initialPosition.y + offsetY,
        });
        if (!this.isPositionBlocked(leftCandidate)) {
          return leftCandidate;
        }

        const rightCandidate = this.clampToWorldBounds({
          x: initialPosition.x + radius,
          y: initialPosition.y + offsetY,
        });
        if (!this.isPositionBlocked(rightCandidate)) {
          return rightCandidate;
        }
      }

      for (let offsetX = -radius; offsetX <= radius; offsetX += SPAWN_SEARCH_STEP) {
        const bottomCandidate = this.clampToWorldBounds({
          x: initialPosition.x + offsetX,
          y: initialPosition.y + radius,
        });
        if (!this.isPositionBlocked(bottomCandidate)) {
          return bottomCandidate;
        }

        const topCandidate = this.clampToWorldBounds({
          x: initialPosition.x + offsetX,
          y: initialPosition.y - radius,
        });
        if (!this.isPositionBlocked(topCandidate)) {
          return topCandidate;
        }
      }
    }

    const fallbackOpenPosition = this.findAnyOpenPosition();
    if (fallbackOpenPosition) {
      return fallbackOpenPosition;
    }

    return initialPosition;
  }

  private isPositionBlocked(position: { x: number; y: number }): boolean {
    return isStaticCollisionAtPosition({
      position,
      playerSize: PLAYER_STATIC_COLLIDER_SIZE,
      collisionIndex: STATIC_COLLISION_INDEX,
    });
  }

  private clampToWorldBounds(position: { x: number; y: number }): { x: number; y: number } {
    return {
      x: clamp(position.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
      y: clamp(position.y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
    };
  }

  private findAnyOpenPosition(): { x: number; y: number } | null {
    for (let y = WORLD_BOUNDS.minY; y <= WORLD_BOUNDS.maxY; y += SPAWN_SEARCH_STEP) {
      for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += SPAWN_SEARCH_STEP) {
        const candidate = { x, y };
        if (!this.isPositionBlocked(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildScopeId(worldId: string, roomId: string): string {
  return `${worldId}::${roomId}`;
}
