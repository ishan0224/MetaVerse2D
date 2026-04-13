import type { InactivityPhase } from '@metaverse2d/shared/types/Inactivity';
import { interpolatePosition, type TimedPosition } from '@metaverse2d/shared/utils/interpolation';
import * as Phaser from 'phaser';

import {
  type AvatarId,
  CHARACTER_SPRITE_SHEET_KEY,
  DEFAULT_AVATAR_ID,
  getIdleFrame,
  type MovementDirection,
  normalizeAvatarId,
} from '@/game/config/characterSpriteConfig';
import { ensureAvatarTexture, normalizeAvatarUrl } from '@/game/utils/avatarTexture';
import {
  type BumpWarningBubble,
  createBumpWarningBubble,
  destroyBumpWarningBubble,
  hideBumpWarningBubble,
  setBumpWarningBubbleDepth,
  showBumpWarningBubble,
  updateBumpWarningBubblePosition,
} from '@/game/utils/bumpWarningBubble';
import { getWalkAnimationKey } from '@/game/utils/characterAnimations';
import { createNameLabel, updateNameLabelPosition } from '@/game/utils/createNameLabel';
import { VoiceWaveBubble } from '@/game/utils/voiceWaveBubble';

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
  avatarId?: number;
  avatarUrl?: string;
};

const DEFAULT_COLOR = 0xf97316;
const DEFAULT_SIZE = 42;
const MAX_POSITION_BUFFER_SIZE = 20;
const WALK_ENTER_DELTA_THRESHOLD = 0.35;
const WALK_EXIT_DELTA_THRESHOLD = 0.12;
const IDLE_SETTLE_DELAY_MS = 120;
const PLAYER_DEPTH_BASE = 100;
const BUMP_WARNING_VISIBLE_MS = 1500;
const INACTIVE_TINT = 0x94a3b8;
const INACTIVE_ALPHA = 0.4;
const ACTIVE_ALPHA = 1;
const INACTIVE_LABEL_OFFSET_Y = 44;

export class RemotePlayer {
  private readonly id: string;
  private readonly scene: Phaser.Scene;
  private readonly size: number;
  private readonly sprite: Phaser.GameObjects.Rectangle;
  private baseColor: number;
  private characterSprite: Phaser.GameObjects.Sprite | null = null;
  private avatarSprite: Phaser.GameObjects.Image | null = null;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private readonly inactivityLabel: Phaser.GameObjects.Text;
  private position: Position;
  private readonly positionBuffer: TimedPosition[] = [];
  private activeAvatarUrl: string | null = null;
  private avatarId: AvatarId = DEFAULT_AVATAR_ID;
  private facingDirection: MovementDirection = 'down';
  private isWalkAnimationActive = false;
  private inactivityPhase: InactivityPhase = 0;
  private idleTransitionTimer: Phaser.Time.TimerEvent | null = null;
  private readonly bumpWarningBubble: BumpWarningBubble;
  private readonly voiceWaveBubble: VoiceWaveBubble;
  private bumpWarningHideTimer: Phaser.Time.TimerEvent | null = null;
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
    avatarId,
    avatarUrl,
  }: RemotePlayerConfig) {
    this.id = id;
    this.scene = scene;
    this.size = size;
    this.baseColor = color;
    this.position = { x, y };
    this.sprite = scene.add.rectangle(x, y, size, size, color);
    this.nameLabel = createNameLabel(scene, name, x, y);
    this.inactivityLabel = scene.add.text(x, y - INACTIVE_LABEL_OFFSET_Y, '💤 Inactive', {
      fontSize: '12px',
      fontStyle: '700',
      color: '#cbd5e1',
      stroke: '#111827',
      strokeThickness: 3,
    });
    this.inactivityLabel.setOrigin(0.5, 1);
    this.inactivityLabel.setVisible(false);
    this.bumpWarningBubble = createBumpWarningBubble(scene);
    this.voiceWaveBubble = new VoiceWaveBubble(scene);
    this.positionBuffer.push({ x, y, timestamp });
    this.avatarId = normalizeAvatarId(avatarId);
    this.characterSprite = this.createCharacterSprite();
    this.setAvatarUrl(avatarUrl);
    this.syncDepth();
  }

  public getId(): string {
    return this.id;
  }

  public setPosition(x: number, y: number): void {
    const deltaX = x - this.position.x;
    const deltaY = y - this.position.y;
    this.position = { x, y };
    this.sprite.setPosition(x, y);
    this.characterSprite?.setPosition(x, y);
    this.avatarSprite?.setPosition(x, y);
    updateNameLabelPosition(this.nameLabel, x, y);
    this.inactivityLabel.setPosition(x, y - INACTIVE_LABEL_OFFSET_Y);
    updateBumpWarningBubblePosition(this.bumpWarningBubble, this.position);
    this.updateCharacterAnimation(deltaX, deltaY);
    this.syncDepth();
  }

  public getPosition(): Position {
    return { ...this.position };
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

  public showBumpWarning(): void {
    if (this.destroyed) {
      return;
    }

    updateBumpWarningBubblePosition(this.bumpWarningBubble, this.position);
    showBumpWarningBubble(this.bumpWarningBubble);
    if (this.bumpWarningHideTimer) {
      this.bumpWarningHideTimer.remove(false);
      this.bumpWarningHideTimer = null;
    }

    this.bumpWarningHideTimer = this.scene.time.delayedCall(BUMP_WARNING_VISIBLE_MS, () => {
      this.bumpWarningHideTimer = null;
      hideBumpWarningBubble(this.bumpWarningBubble);
    });
  }

  public setColor(color: number): void {
    this.baseColor = color;
    this.sprite.setFillStyle(color);
    this.applyInactivityVisualState();
  }

  public setAvatarId(avatarId: number | undefined): void {
    const normalizedAvatarId = normalizeAvatarId(avatarId);
    if (this.avatarId === normalizedAvatarId) {
      return;
    }

    this.avatarId = normalizedAvatarId;
    this.ensureCharacterSprite();
    this.refreshCharacterVisual();
  }

  public setAvatarUrl(avatarUrl: string | undefined): void {
    const normalized = normalizeAvatarUrl(avatarUrl);
    this.activeAvatarUrl = normalized;

    if (!normalized) {
      this.clearAvatarSprite();
      this.refreshCharacterVisual();
      return;
    }

    void this.applyAvatarUrl(normalized);
  }

  public setName(name: string): void {
    this.nameLabel.setText(name);
  }

  public setInactivityPhase(inactivityPhase: InactivityPhase): void {
    if (this.inactivityPhase === inactivityPhase) {
      return;
    }

    this.inactivityPhase = inactivityPhase;
    this.applyInactivityVisualState();
  }

  public updateVoiceWaveBubble({
    nowMs,
    visible,
    reactiveBarScales,
    hasReactiveSignal,
    hasAnalyser,
  }: {
    nowMs: number;
    visible: boolean;
    reactiveBarScales: number[] | null;
    hasReactiveSignal: boolean;
    hasAnalyser: boolean;
  }): void {
    this.voiceWaveBubble.update({
      position: this.position,
      playerSize: this.size,
      nowMs,
      visible,
      reactiveBarScales,
      hasReactiveSignal,
      hasAnalyser,
    });
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.idleTransitionTimer) {
      this.idleTransitionTimer.remove(false);
      this.idleTransitionTimer = null;
    }
    if (this.bumpWarningHideTimer) {
      this.bumpWarningHideTimer.remove(false);
      this.bumpWarningHideTimer = null;
    }
    destroyBumpWarningBubble(this.bumpWarningBubble);
    this.voiceWaveBubble.destroy();
    this.clearAvatarSprite();
    this.characterSprite?.destroy();
    this.characterSprite = null;
    this.sprite.destroy();
    this.nameLabel.destroy();
    this.inactivityLabel.destroy();
  }

  private trimConsumedStates(renderTime: number): void {
    while (this.positionBuffer.length > 2 && this.positionBuffer[1].timestamp <= renderTime) {
      this.positionBuffer.shift();
    }
  }

  private createCharacterSprite(): Phaser.GameObjects.Sprite | null {
    if (!this.scene.textures.exists(CHARACTER_SPRITE_SHEET_KEY)) {
      return null;
    }

    const characterSprite = this.scene.add.sprite(
      this.position.x,
      this.position.y,
      CHARACTER_SPRITE_SHEET_KEY,
      getIdleFrame(this.avatarId, this.facingDirection),
    );
    characterSprite.setDisplaySize(this.size, this.size);
    characterSprite.setVisible(false);
    return characterSprite;
  }

  private ensureCharacterSprite(): void {
    if (this.characterSprite || !this.scene.textures.exists(CHARACTER_SPRITE_SHEET_KEY)) {
      return;
    }

    this.characterSprite = this.createCharacterSprite();
  }

  private refreshCharacterVisual(): void {
    if (!this.characterSprite || this.avatarSprite) {
      this.sprite.setVisible(!this.avatarSprite);
      this.characterSprite?.setVisible(false);
      return;
    }

    const wasPlaying = this.characterSprite.anims.isPlaying;
    this.characterSprite.setVisible(true);
    this.sprite.setVisible(false);
    if (this.isWalkAnimationActive || wasPlaying) {
      this.playWalkAnimation(this.facingDirection);
      this.applyInactivityVisualState();
      return;
    }

    this.showIdleFrame();
    this.applyInactivityVisualState();
  }

  private updateCharacterAnimation(deltaX: number, deltaY: number): void {
    if (!this.characterSprite || this.avatarSprite) {
      return;
    }

    const movementDeltaMagnitude = Math.hypot(deltaX, deltaY);

    if (this.isWalkAnimationActive) {
      if (movementDeltaMagnitude > WALK_EXIT_DELTA_THRESHOLD) {
        this.cancelIdleTransition();
        this.updateFacingDirection(deltaX, deltaY);
        this.playWalkAnimation(this.facingDirection);
        return;
      }

      this.scheduleIdleTransition();
      return;
    }

    if (movementDeltaMagnitude >= WALK_ENTER_DELTA_THRESHOLD) {
      this.cancelIdleTransition();
      this.isWalkAnimationActive = true;
      this.updateFacingDirection(deltaX, deltaY);
      this.playWalkAnimation(this.facingDirection);
      return;
    }

    this.showIdleFrame();
  }

  private playWalkAnimation(direction: MovementDirection): void {
    if (!this.characterSprite) {
      return;
    }

    const animationKey = getWalkAnimationKey(this.avatarId, direction);
    const currentAnimationKey = this.characterSprite.anims.currentAnim?.key;
    if (currentAnimationKey === animationKey && this.characterSprite.anims.isPlaying) {
      return;
    }

    this.characterSprite.play(animationKey, true);
  }

  private showIdleFrame(): void {
    if (!this.characterSprite) {
      return;
    }

    this.isWalkAnimationActive = false;
    if (this.characterSprite.anims.isPlaying) {
      this.characterSprite.stop();
    }

    this.characterSprite.setFrame(getIdleFrame(this.avatarId, this.facingDirection));
  }

  private scheduleIdleTransition(): void {
    if (this.idleTransitionTimer) {
      return;
    }

    this.idleTransitionTimer = this.scene.time.delayedCall(IDLE_SETTLE_DELAY_MS, () => {
      this.idleTransitionTimer = null;
      if (this.destroyed || !this.isWalkAnimationActive) {
        return;
      }

      this.showIdleFrame();
    });
  }

  private cancelIdleTransition(): void {
    if (!this.idleTransitionTimer) {
      return;
    }

    this.idleTransitionTimer.remove(false);
    this.idleTransitionTimer = null;
  }

  private updateFacingDirection(deltaX: number, deltaY: number): void {
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      this.facingDirection = deltaX >= 0 ? 'right' : 'left';
      return;
    }

    this.facingDirection = deltaY >= 0 ? 'down' : 'up';
  }

  private async applyAvatarUrl(avatarUrl: string): Promise<void> {
    const textureKey = await ensureAvatarTexture(this.scene, avatarUrl);
    if (this.destroyed || this.activeAvatarUrl !== avatarUrl || !textureKey) {
      if (this.activeAvatarUrl === avatarUrl && !textureKey) {
        this.clearAvatarSprite();
        this.refreshCharacterVisual();
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
    this.avatarSprite.setVisible(true);
    this.characterSprite?.setVisible(false);
    this.sprite.setVisible(false);
    this.applyInactivityVisualState();
  }

  private clearAvatarSprite(): void {
    if (!this.avatarSprite) {
      return;
    }

    this.avatarSprite.destroy();
    this.avatarSprite = null;
    this.applyInactivityVisualState();
  }

  private applyInactivityVisualState(): void {
    const isInactive = this.inactivityPhase >= 1 && this.inactivityPhase < 3;
    const alpha = isInactive ? INACTIVE_ALPHA : ACTIVE_ALPHA;
    this.sprite.setAlpha(alpha);
    this.characterSprite?.setAlpha(alpha);
    this.avatarSprite?.setAlpha(alpha);

    if (isInactive) {
      this.sprite.setFillStyle(INACTIVE_TINT);
      this.characterSprite?.setTint(INACTIVE_TINT);
      this.avatarSprite?.setTint(INACTIVE_TINT);
      this.inactivityLabel.setVisible(true);
      this.nameLabel.setAlpha(0.9);
      return;
    }

    this.sprite.setFillStyle(this.baseColor);
    this.characterSprite?.clearTint();
    this.avatarSprite?.clearTint();
    this.inactivityLabel.setVisible(false);
    this.nameLabel.setAlpha(1);
  }

  private syncDepth(): void {
    const depth = PLAYER_DEPTH_BASE + this.position.y;
    this.sprite.setDepth(depth);
    this.characterSprite?.setDepth(depth);
    this.avatarSprite?.setDepth(depth);
    this.nameLabel.setDepth(depth + 1);
    this.inactivityLabel.setDepth(depth + 2);
    setBumpWarningBubbleDepth(this.bumpWarningBubble, depth);
    this.voiceWaveBubble.setDepth(depth);
  }
}
