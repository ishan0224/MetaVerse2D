import {
  type BaseInputState,
  type InputState,
} from '@metaverse2d/shared/types/InputState';

import type { MovementVector } from '@/store/useInputStore';

const JOYSTICK_DEADZONE = 0.12;
const JOYSTICK_DIRECTION_THRESHOLD = 0.2;
const JOYSTICK_DAMPING_PER_SECOND = 18;
const VECTOR_QUANTIZE_STEP = 0.01;

type ResolvePlayerInputParams = {
  keyboardState: BaseInputState;
  joystickTargetVector: MovementVector;
  previousJoystickVector: MovementVector;
  deltaMs: number;
};

type ResolvePlayerInputResult = {
  nextJoystickVector: MovementVector;
  inputState: InputState;
};

export function resolvePlayerInputState({
  keyboardState,
  joystickTargetVector,
  previousJoystickVector,
  deltaMs,
}: ResolvePlayerInputParams): ResolvePlayerInputResult {
  const normalizedKeyboardVector = normalizeVector(deriveKeyboardVector(keyboardState));
  const normalizedJoystickTarget = normalizeVector(joystickTargetVector);
  const smoothedJoystickVector = smoothJoystickVector(
    previousJoystickVector,
    normalizedJoystickTarget,
    deltaMs,
  );
  const combinedVector = normalizeVector({
    x: normalizedKeyboardVector.x + smoothedJoystickVector.x,
    y: normalizedKeyboardVector.y + smoothedJoystickVector.y,
  });
  const quantizedCombinedVector = quantizeVector(combinedVector, VECTOR_QUANTIZE_STEP);

  return {
    nextJoystickVector: smoothedJoystickVector,
    inputState: {
      up: keyboardState.up || quantizedCombinedVector.y < -JOYSTICK_DIRECTION_THRESHOLD,
      down: keyboardState.down || quantizedCombinedVector.y > JOYSTICK_DIRECTION_THRESHOLD,
      left: keyboardState.left || quantizedCombinedVector.x < -JOYSTICK_DIRECTION_THRESHOLD,
      right: keyboardState.right || quantizedCombinedVector.x > JOYSTICK_DIRECTION_THRESHOLD,
      moveX: quantizedCombinedVector.x,
      moveY: quantizedCombinedVector.y,
    },
  };
}

function deriveKeyboardVector(keyboardState: BaseInputState): MovementVector {
  const rawX = Number(keyboardState.right) - Number(keyboardState.left);
  const rawY = Number(keyboardState.down) - Number(keyboardState.up);
  return normalizeVector({ x: rawX, y: rawY });
}

function smoothJoystickVector(
  currentVector: MovementVector,
  targetVector: MovementVector,
  deltaMs: number,
): MovementVector {
  const targetMagnitude = Math.hypot(targetVector.x, targetVector.y);
  if (targetMagnitude < JOYSTICK_DEADZONE) {
    return { x: 0, y: 0 };
  }

  const clampedDeltaSeconds = Math.max(0, Math.min(1, deltaMs / 1000));
  const interpolationFactor = 1 - Math.exp(-JOYSTICK_DAMPING_PER_SECOND * clampedDeltaSeconds);

  return quantizeVector(
    {
      x: lerp(currentVector.x, targetVector.x, interpolationFactor),
      y: lerp(currentVector.y, targetVector.y, interpolationFactor),
    },
    VECTOR_QUANTIZE_STEP,
  );
}

function normalizeVector(vector: MovementVector): MovementVector {
  const safeX = clampAxis(vector.x);
  const safeY = clampAxis(vector.y);
  const magnitude = Math.hypot(safeX, safeY);

  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }

  if (magnitude <= 1) {
    return { x: safeX, y: safeY };
  }

  return {
    x: safeX / magnitude,
    y: safeY / magnitude,
  };
}

function quantizeVector(vector: MovementVector, step: number): MovementVector {
  if (step <= 0) {
    return vector;
  }

  return {
    x: quantize(vector.x, step),
    y: quantize(vector.y, step),
  };
}

function quantize(value: number, step: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value / step) * step;
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-1, Math.min(1, value));
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}
