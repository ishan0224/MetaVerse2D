import type { InputState } from '@metaverse2d/shared/types/InputState';
import { getNextPosition, type Position2D } from '@metaverse2d/shared/utils/movement';

type MovementSystemConfig = {
  speed: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
};

export class MovementSystem {
  private readonly speed: number;
  private readonly bounds: MovementSystemConfig['bounds'];

  public constructor({ speed, bounds }: MovementSystemConfig) {
    this.speed = speed;
    this.bounds = bounds;
  }

  public updatePosition(currentPosition: Position2D, input: InputState, deltaMs: number): Position2D {
    return getNextPosition({
      currentPosition,
      input,
      deltaMs,
      speed: this.speed,
      bounds: this.bounds,
    });
  }
}
