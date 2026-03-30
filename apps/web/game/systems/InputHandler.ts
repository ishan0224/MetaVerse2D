import {
  type BaseInputState,
  type InputState,
} from '@metaverse2d/shared/types/InputState';
import * as Phaser from 'phaser';

import { resolvePlayerInputState } from '@/game/playerController';
import { getJoystickVector, type MovementVector } from '@/store/useInputStore';

export class InputHandler {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasdKeys: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private smoothedJoystickVector: MovementVector = { x: 0, y: 0 };

  public constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard manager is unavailable for this scene.');
    }

    this.cursors = keyboard.createCursorKeys();
    this.wasdKeys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as InputHandler['wasdKeys'];
  }

  public getInputState(deltaMs: number): InputState {
    const keyboardState: BaseInputState = {
      up: this.cursors.up.isDown || this.wasdKeys.up.isDown,
      down: this.cursors.down.isDown || this.wasdKeys.down.isDown,
      left: this.cursors.left.isDown || this.wasdKeys.left.isDown,
      right: this.cursors.right.isDown || this.wasdKeys.right.isDown,
    };

    const { inputState, nextJoystickVector } = resolvePlayerInputState({
      keyboardState,
      joystickTargetVector: getJoystickVector(),
      previousJoystickVector: this.smoothedJoystickVector,
      deltaMs,
    });

    this.smoothedJoystickVector = nextJoystickVector;
    return inputState;
  }
}
