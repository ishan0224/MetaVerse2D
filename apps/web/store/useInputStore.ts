import { create } from 'zustand';

const AXIS_CLAMP_MIN = -1;
const AXIS_CLAMP_MAX = 1;

export type MovementVector = {
  x: number;
  y: number;
};

type InputStoreState = {
  joystickVector: MovementVector;
  setJoystickVector: (nextVector: MovementVector) => void;
  resetMovementInput: () => void;
};

const ZERO_VECTOR: MovementVector = { x: 0, y: 0 };

export const useInputStore = create<InputStoreState>((set) => ({
  joystickVector: ZERO_VECTOR,
  setJoystickVector: (nextVector) => {
    const normalized = normalizeMovementVector(nextVector);

    set((previous) => {
      if (
        previous.joystickVector.x === normalized.x &&
        previous.joystickVector.y === normalized.y
      ) {
        return previous;
      }

      return {
        ...previous,
        joystickVector: normalized,
      };
    });
  },
  resetMovementInput: () => {
    set((previous) => {
      if (previous.joystickVector.x === 0 && previous.joystickVector.y === 0) {
        return previous;
      }

      return {
        ...previous,
        joystickVector: ZERO_VECTOR,
      };
    });
  },
}));

export function getJoystickVector(): MovementVector {
  return useInputStore.getState().joystickVector;
}

export function setJoystickVector(nextVector: MovementVector): void {
  useInputStore.getState().setJoystickVector(nextVector);
}

export function resetMovementInput(): void {
  useInputStore.getState().resetMovementInput();
}

function normalizeMovementVector(vector: MovementVector): MovementVector {
  const safeX = clampAxis(vector.x);
  const safeY = clampAxis(vector.y);
  const magnitude = Math.hypot(safeX, safeY);
  if (magnitude === 0) {
    return ZERO_VECTOR;
  }

  if (magnitude <= 1) {
    return {
      x: safeX,
      y: safeY,
    };
  }

  return {
    x: safeX / magnitude,
    y: safeY / magnitude,
  };
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(AXIS_CLAMP_MIN, Math.min(AXIS_CLAMP_MAX, value));
}
