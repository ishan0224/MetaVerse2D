import type { InputState } from '../types/InputState';

export type Position2D = {
  x: number;
  y: number;
};

export type MovementParams = {
  currentPosition: Position2D;
  input: InputState;
  deltaMs: number;
  speed: number;
  bounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
};

export function getNextPosition({
  currentPosition,
  input,
  deltaMs,
  speed,
  bounds,
}: MovementParams): Position2D {
  const horizontalDirection = Number(input.right) - Number(input.left);
  const verticalDirection = Number(input.down) - Number(input.up);

  if (horizontalDirection === 0 && verticalDirection === 0) {
    return { ...currentPosition };
  }

  const directionMagnitude = Math.hypot(horizontalDirection, verticalDirection);
  const normalizedHorizontal = horizontalDirection / directionMagnitude;
  const normalizedVertical = verticalDirection / directionMagnitude;
  const distance = speed * (deltaMs / 1000);

  const nextPosition = {
    x: currentPosition.x + normalizedHorizontal * distance,
    y: currentPosition.y + normalizedVertical * distance,
  };

  if (!bounds) {
    return nextPosition;
  }

  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, nextPosition.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, nextPosition.y)),
  };
}
