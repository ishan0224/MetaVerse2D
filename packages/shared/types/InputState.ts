export type BaseInputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export type AnalogInputState = {
  moveX: number;
  moveY: number;
};

export type InputExtensionState = {
  interact: boolean;
  action: boolean;
  voice: boolean;
};

export type InputState = BaseInputState & Partial<InputExtensionState & AnalogInputState>;

export function createDefaultInputState(): BaseInputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
  };
}

export function mergeInputStates(
  primary: BaseInputState,
  secondary: BaseInputState,
): BaseInputState {
  return {
    up: primary.up || secondary.up,
    down: primary.down || secondary.down,
    left: primary.left || secondary.left,
    right: primary.right || secondary.right,
  };
}
