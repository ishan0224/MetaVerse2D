import type { InputState } from '@metaverse2d/shared/types/InputState';
import * as Phaser from 'phaser';

export class InputHandler {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasdKeys: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

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

  public getInputState(): InputState {
    return {
      up: this.cursors.up.isDown || this.wasdKeys.up.isDown,
      down: this.cursors.down.isDown || this.wasdKeys.down.isDown,
      left: this.cursors.left.isDown || this.wasdKeys.left.isDown,
      right: this.cursors.right.isDown || this.wasdKeys.right.isDown,
    };
  }
}
