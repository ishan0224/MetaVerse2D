import * as Phaser from 'phaser';

import { createNameLabel, updateNameLabelPosition } from '@/game/utils/createNameLabel';

type Position = {
  x: number;
  y: number;
};

type PlayerConfig = {
  id: string;
  x: number;
  y: number;
  scene: Phaser.Scene;
  name: string;
  color?: number;
  size?: number;
};

const DEFAULT_COLOR = 0x3b82f6;
const DEFAULT_SIZE = 32;

export class Player {
  private readonly id: string;
  private readonly sprite: Phaser.GameObjects.Rectangle;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private position: Position;

  public constructor({ id, x, y, scene, name, color = DEFAULT_COLOR, size = DEFAULT_SIZE }: PlayerConfig) {
    this.id = id;
    this.position = { x, y };
    this.sprite = scene.add.rectangle(x, y, size, size, color);
    this.nameLabel = createNameLabel(scene, name, x, y);
  }

  public getId(): string {
    return this.id;
  }

  public setPosition(x: number, y: number): void {
    this.position = { x, y };
    this.sprite.setPosition(x, y);
    updateNameLabelPosition(this.nameLabel, x, y);
  }

  public getPosition(): Position {
    return { ...this.position };
  }

  public getSprite(): Phaser.GameObjects.Rectangle {
    return this.sprite;
  }

  public update(): void {
    this.sprite.setPosition(this.position.x, this.position.y);
    updateNameLabelPosition(this.nameLabel, this.position.x, this.position.y);
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
}
