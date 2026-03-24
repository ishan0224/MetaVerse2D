import type { InputState, Player } from '@metaverse2d/shared';
import { getNextPosition, resolvePlayerCollisions } from '@metaverse2d/shared';

const PLAYER_SPEED = 220;
const WORLD_BOUNDS = {
  minX: 0,
  maxX: 2400,
  minY: 0,
  maxY: 1600,
} as const;
const SPAWN_ORIGIN = {
  x: 512,
  y: 288,
} as const;
const SPAWN_STEP = 48;
const PLAYER_COLORS = [0x3b82f6, 0xf97316, 0x10b981, 0xeab308];
const PLAYER_COLLISION_DISTANCE = 28;
const PLAYER_MAX_PUSH_PER_UPDATE = 2.25;

export class PlayerManager {
  private readonly players = new Map<string, Player>();

  public addPlayer(id: string, name: string): Player {
    const playerIndex = this.players.size;
    const spawnOffset = playerIndex * SPAWN_STEP;
    const player: Player = {
      id,
      x: Math.min(WORLD_BOUNDS.maxX, SPAWN_ORIGIN.x + spawnOffset),
      y: Math.min(WORLD_BOUNDS.maxY, SPAWN_ORIGIN.y + spawnOffset),
      name,
      roomId: 'default',
      color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
    };

    this.players.set(id, player);
    return player;
  }

  public removePlayer(id: string): void {
    this.players.delete(id);
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
    this.resolveCollisions();

    return this.players.get(id) ?? null;
  }

  public getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  private resolveCollisions(): void {
    const resolvedPlayers = resolvePlayerCollisions(this.getAllPlayers(), {
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
