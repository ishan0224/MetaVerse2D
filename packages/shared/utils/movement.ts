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
  const movementVector = resolveMovementVector(input);
  const movementMagnitude = Math.hypot(movementVector.x, movementVector.y);
  if (movementMagnitude === 0) {
    return { ...currentPosition };
  }

  const normalizedHorizontal = movementVector.x / movementMagnitude;
  const normalizedVertical = movementVector.y / movementMagnitude;
  const distance = speed * (deltaMs / 1000) * movementMagnitude;

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

function resolveMovementVector(input: InputState): Position2D {
  const moveX = clampAxis(input.moveX ?? 0);
  const moveY = clampAxis(input.moveY ?? 0);
  const analogMagnitude = Math.hypot(moveX, moveY);
  if (analogMagnitude > 0) {
    if (analogMagnitude <= 1) {
      return { x: moveX, y: moveY };
    }

    return {
      x: moveX / analogMagnitude,
      y: moveY / analogMagnitude,
    };
  }

  const horizontalDirection = Number(input.right) - Number(input.left);
  const verticalDirection = Number(input.down) - Number(input.up);
  const directionMagnitude = Math.hypot(horizontalDirection, verticalDirection);
  if (directionMagnitude === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: horizontalDirection / directionMagnitude,
    y: verticalDirection / directionMagnitude,
  };
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-1, Math.min(1, value));
}
