import { interpolatePosition, type TimedPosition } from '@metaverse2d/shared/utils/interpolation';
import * as Phaser from 'phaser';

import { createNameLabel, updateNameLabelPosition } from '@/game/utils/createNameLabel';

type Position = {
  x: number;
  y: number;
};

type RemotePlayerConfig = {
  id: string;
  x: number;
  y: number;
  timestamp: number;
  scene: Phaser.Scene;
  name: string;
  color?: number;
  size?: number;
};

const DEFAULT_COLOR = 0xf97316;
const DEFAULT_SIZE = 28;
const MAX_POSITION_BUFFER_SIZE = 20;

export class RemotePlayer {
  private readonly id: string;
  private readonly sprite: Phaser.GameObjects.Rectangle;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private position: Position;
  private readonly positionBuffer: TimedPosition[] = [];

  public constructor({ id, x, y, timestamp, scene, name, color = DEFAULT_COLOR, size = DEFAULT_SIZE }: RemotePlayerConfig) {
    this.id = id;
    this.position = { x, y };
    this.sprite = scene.add.rectangle(x, y, size, size, color);
    this.nameLabel = createNameLabel(scene, name, x, y);
    this.positionBuffer.push({ x, y, timestamp });
  }

  public getId(): string {
    return this.id;
  }

  public setPosition(x: number, y: number): void {
    this.position = { x, y };
    this.sprite.setPosition(x, y);
    updateNameLabelPosition(this.nameLabel, x, y);
  }

  public addServerPosition(x: number, y: number, timestamp: number): void {
    const lastState = this.positionBuffer[this.positionBuffer.length - 1];
    if (lastState && timestamp <= lastState.timestamp) {
      return;
    }

    this.positionBuffer.push({ x, y, timestamp });
    if (this.positionBuffer.length > MAX_POSITION_BUFFER_SIZE) {
      this.positionBuffer.shift();
    }
  }

  public update(renderTime: number): void {
    const interpolatedPosition = interpolatePosition(this.positionBuffer, renderTime);
    if (!interpolatedPosition) {
      return;
    }

    this.setPosition(interpolatedPosition.x, interpolatedPosition.y);
    this.trimConsumedStates(renderTime);
  }

  public setColor(color: number): void {
    this.sprite.setFillStyle(color);
  }

  public setName(name: string): void {
    this.nameLabel.setText(name);
  }

  public destroy(): void {
    this.sprite.destroy();
    this.nameLabel.destroy();
  }

  private trimConsumedStates(renderTime: number): void {
    while (this.positionBuffer.length > 2 && this.positionBuffer[1].timestamp <= renderTime) {
      this.positionBuffer.shift();
    }
  }
}
