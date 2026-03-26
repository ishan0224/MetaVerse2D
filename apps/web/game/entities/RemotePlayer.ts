import { interpolatePosition, type TimedPosition } from '@metaverse2d/shared/utils/interpolation';
import * as Phaser from 'phaser';

import { ensureAvatarTexture, normalizeAvatarUrl } from '@/game/utils/avatarTexture';
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
  avatarUrl?: string;
};

const DEFAULT_COLOR = 0xf97316;
const DEFAULT_SIZE = 28;
const MAX_POSITION_BUFFER_SIZE = 20;

export class RemotePlayer {
  private readonly id: string;
  private readonly scene: Phaser.Scene;
  private readonly size: number;
  private readonly sprite: Phaser.GameObjects.Rectangle;
  private avatarSprite: Phaser.GameObjects.Image | null = null;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private position: Position;
  private readonly positionBuffer: TimedPosition[] = [];
  private activeAvatarUrl: string | null = null;
  private destroyed = false;

  public constructor({
    id,
    x,
    y,
    timestamp,
    scene,
    name,
    color = DEFAULT_COLOR,
    size = DEFAULT_SIZE,
    avatarUrl,
  }: RemotePlayerConfig) {
    this.id = id;
    this.scene = scene;
    this.size = size;
    this.position = { x, y };
    this.sprite = scene.add.rectangle(x, y, size, size, color);
    this.nameLabel = createNameLabel(scene, name, x, y);
    this.positionBuffer.push({ x, y, timestamp });
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

  private trimConsumedStates(renderTime: number): void {
    while (this.positionBuffer.length > 2 && this.positionBuffer[1].timestamp <= renderTime) {
      this.positionBuffer.shift();
    }
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
