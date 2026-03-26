import * as Phaser from 'phaser';

import { ensureAvatarTexture, normalizeAvatarUrl } from '@/game/utils/avatarTexture';
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
  avatarUrl?: string;
};

const DEFAULT_COLOR = 0x3b82f6;
const DEFAULT_SIZE = 32;

export class Player {
  private readonly id: string;
  private readonly scene: Phaser.Scene;
  private readonly size: number;
  private readonly sprite: Phaser.GameObjects.Rectangle;
  private avatarSprite: Phaser.GameObjects.Image | null = null;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private position: Position;
  private activeAvatarUrl: string | null = null;
  private destroyed = false;

  public constructor({
    id,
    x,
    y,
    scene,
    name,
    color = DEFAULT_COLOR,
    size = DEFAULT_SIZE,
    avatarUrl,
  }: PlayerConfig) {
    this.id = id;
    this.scene = scene;
    this.size = size;
    this.position = { x, y };
    this.sprite = scene.add.rectangle(x, y, size, size, color);
    this.nameLabel = createNameLabel(scene, name, x, y);
    this.setAvatarUrl(avatarUrl);
  }

  public getId(): string {
    return this.id;
  }

  public setPosition(x: number, y: number): void {
    this.position = { x, y };
    this.sprite.setPosition(x, y);
    this.avatarSprite?.setPosition(x, y);
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
    this.avatarSprite?.setPosition(this.position.x, this.position.y);
    updateNameLabelPosition(this.nameLabel, this.position.x, this.position.y);
  }

  public setColor(color: number): void {
    this.sprite.setFillStyle(color);
  }

  public setAvatarUrl(avatarUrl: string | undefined): void {
    const normalized = normalizeAvatarUrl(avatarUrl);
    this.activeAvatarUrl = normalized;

    if (!normalized) {
      this.clearAvatarSprite();
      this.sprite.setVisible(true);
      return;
    }

    void this.applyAvatarUrl(normalized);
  }

  public setName(name: string): void {
    this.nameLabel.setText(name);
  }

  public destroy(): void {
    this.destroyed = true;
    this.clearAvatarSprite();
    this.sprite.destroy();
    this.nameLabel.destroy();
  }

  private async applyAvatarUrl(avatarUrl: string): Promise<void> {
    const textureKey = await ensureAvatarTexture(this.scene, avatarUrl);
    if (this.destroyed || this.activeAvatarUrl !== avatarUrl || !textureKey) {
      if (this.activeAvatarUrl === avatarUrl && !textureKey) {
        this.clearAvatarSprite();
        this.sprite.setVisible(true);
      }
      return;
    }

    if (this.avatarSprite) {
      this.avatarSprite.setTexture(textureKey);
    } else {
      this.avatarSprite = this.scene.add.image(this.position.x, this.position.y, textureKey);
    }

    this.avatarSprite.setDisplaySize(this.size, this.size);
    this.avatarSprite.setPosition(this.position.x, this.position.y);
    this.sprite.setVisible(false);
  }

  private clearAvatarSprite(): void {
    if (!this.avatarSprite) {
      return;
    }

    this.avatarSprite.destroy();
    this.avatarSprite = null;
  }
}
