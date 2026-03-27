import type { InputState } from '@metaverse2d/shared/types/InputState';
import { getNextPosition, type Position2D } from '@metaverse2d/shared/utils/movement';
import {
  resolveStaticCollisions,
  type StaticCollisionIndex,
} from '@metaverse2d/shared/utils/staticCollision';

type MovementSystemConfig = {
  speed: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  staticCollisionIndex?: StaticCollisionIndex | null;
  playerColliderSize?: number;
};

export class MovementSystem {
  private readonly speed: number;
  private readonly bounds: MovementSystemConfig['bounds'];
  private readonly staticCollisionIndex: StaticCollisionIndex | null;
  private readonly playerColliderSize: number;

  public constructor({ speed, bounds, staticCollisionIndex = null, playerColliderSize = 0 }: MovementSystemConfig) {
    this.speed = speed;
    this.bounds = bounds;
    this.staticCollisionIndex = staticCollisionIndex;
    this.playerColliderSize = playerColliderSize;
  }

  public updatePosition(currentPosition: Position2D, input: InputState, deltaMs: number): Position2D {
    const intendedPosition = getNextPosition({
      currentPosition,
      input,
      deltaMs,
      speed: this.speed,
      bounds: this.bounds,
    });

    if (!this.staticCollisionIndex || this.playerColliderSize <= 0) {
      return intendedPosition;
    }

    return resolveStaticCollisions({
      currentPosition,
      intendedPosition,
      playerSize: this.playerColliderSize,
      collisionIndex: this.staticCollisionIndex,
    });
  }
}
