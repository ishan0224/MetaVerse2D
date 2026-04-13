import * as Phaser from 'phaser';

const BAR_COUNT = 5;
const BAR_WIDTH = 3;
const BAR_HEIGHT = 8;
const BAR_GAP = 2;
const BAR_DELAYS_MS = [0, 100, 200, 50, 150] as const;

const BUBBLE_WIDTH = 34;
const BUBBLE_HEIGHT = 20;
const BUBBLE_RADIUS = 8;
const BUBBLE_TAIL_WIDTH = 8;
const BUBBLE_TAIL_HEIGHT = 5;
const BUBBLE_FLOAT_OFFSET_Y = 14;
const BUBBLE_BOB_DISTANCE = 3;
const BUBBLE_BOB_DURATION_MS = 2000;
const BUBBLE_FADE_IN_MS = 150;
const BUBBLE_FADE_OUT_MS = 200;
const BUBBLE_DEPTH_OFFSET = 10_000;

const BUBBLE_FILL_COLOR = 0xf0ede8;
const BAR_COLOR = 0x5a5460;

const IDLE_BAR_MIN_SCALE = 0.4;
const IDLE_BAR_MAX_SCALE = 1.5;
const IDLE_BAR_CYCLE_MS = 1000;
const LOW_IDLE_BAR_SCALE = 0.45;
const REACTIVE_BAR_MIN_SCALE = 0.3;
const REACTIVE_BAR_MAX_SCALE = 2.5;
const BAR_SCALE_LERP_FACTOR = 0.28;
const LOW_IDLE_DELAY_MS = 800;

export type VoiceWaveBubbleUpdateInput = {
  position: { x: number; y: number };
  playerSize: number;
  nowMs: number;
  visible: boolean;
  reactiveBarScales: number[] | null;
  hasReactiveSignal: boolean;
  hasAnalyser: boolean;
};

export class VoiceWaveBubble {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bars: Phaser.GameObjects.Rectangle[];
  private readonly currentScales: number[];
  private readonly bobOffsetMs: number;
  private fadeTween: Phaser.Tweens.Tween | null = null;
  private targetVisible = false;
  private lastSignalAtMs = Number.NEGATIVE_INFINITY;
  private visibleSinceMs = Number.NEGATIVE_INFINITY;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bobOffsetMs = Math.random() * BUBBLE_BOB_DURATION_MS;
    this.currentScales = Array.from({ length: BAR_COUNT }, () => IDLE_BAR_MIN_SCALE);

    const bubbleBody = scene.add.graphics();
    bubbleBody
      .fillStyle(BUBBLE_FILL_COLOR, 0.98)
      .fillRoundedRect(
        -BUBBLE_WIDTH / 2,
        -BUBBLE_TAIL_HEIGHT - BUBBLE_HEIGHT,
        BUBBLE_WIDTH,
        BUBBLE_HEIGHT,
        BUBBLE_RADIUS,
      );

    const bubbleTail = scene.add.graphics();
    bubbleTail
      .fillStyle(BUBBLE_FILL_COLOR, 0.98)
      .beginPath()
      .moveTo(-BUBBLE_TAIL_WIDTH / 2, -BUBBLE_TAIL_HEIGHT)
      .lineTo(BUBBLE_TAIL_WIDTH / 2, -BUBBLE_TAIL_HEIGHT)
      .lineTo(0, 0)
      .closePath()
      .fillPath();

    const barsTotalWidth = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_GAP;
    const barsBottomY = -BUBBLE_TAIL_HEIGHT - 4;
    const barsStartX = -barsTotalWidth / 2 + BAR_WIDTH / 2;
    this.bars = Array.from({ length: BAR_COUNT }, (_, index) => {
      const bar = scene.add.rectangle(
        barsStartX + index * (BAR_WIDTH + BAR_GAP),
        barsBottomY,
        BAR_WIDTH,
        BAR_HEIGHT,
        BAR_COLOR,
      );
      bar.setOrigin(0.5, 1);
      return bar;
    });

    this.container = scene.add.container(0, 0, [bubbleBody, bubbleTail, ...this.bars]);
    this.container.setAlpha(0);
    this.container.setVisible(false);
  }

  public update(input: VoiceWaveBubbleUpdateInput): void {
    const becameVisible = !this.targetVisible && input.visible;
    this.setVisibleTarget(input.visible);
    if (becameVisible) {
      this.visibleSinceMs = input.nowMs;
      this.lastSignalAtMs = Number.NEGATIVE_INFINITY;
    } else if (!input.visible) {
      this.visibleSinceMs = Number.NEGATIVE_INFINITY;
      this.lastSignalAtMs = Number.NEGATIVE_INFINITY;
    }
    this.updatePosition(input.position, input.playerSize, input.nowMs);

    const targetScales = this.resolveTargetBarScales(input);
    for (let index = 0; index < BAR_COUNT; index += 1) {
      const currentScale = this.currentScales[index];
      const nextScale =
        currentScale + (targetScales[index] - currentScale) * BAR_SCALE_LERP_FACTOR;
      const clampedScale = clamp(nextScale, REACTIVE_BAR_MIN_SCALE, REACTIVE_BAR_MAX_SCALE);
      this.currentScales[index] = clampedScale;
      this.bars[index].setScale(1, clampedScale);
    }
  }

  public setDepth(playerDepth: number): void {
    this.container.setDepth(playerDepth + BUBBLE_DEPTH_OFFSET);
  }

  public destroy(): void {
    this.fadeTween?.stop();
    this.fadeTween = null;
    this.container.destroy(true);
  }

  private updatePosition(position: { x: number; y: number }, playerSize: number, nowMs: number): void {
    const bobPhase = ((nowMs + this.bobOffsetMs) % BUBBLE_BOB_DURATION_MS) / BUBBLE_BOB_DURATION_MS;
    const bobOffsetY = Math.sin(bobPhase * Math.PI * 2) * BUBBLE_BOB_DISTANCE;
    this.container.setPosition(
      position.x,
      position.y - playerSize / 2 - BUBBLE_FLOAT_OFFSET_Y + bobOffsetY,
    );
  }

  private resolveTargetBarScales(input: VoiceWaveBubbleUpdateInput): number[] {
    if (!input.visible) {
      return Array.from({ length: BAR_COUNT }, () => LOW_IDLE_BAR_SCALE);
    }

    if (input.reactiveBarScales && input.hasReactiveSignal) {
      this.lastSignalAtMs = input.nowMs;
      return input.reactiveBarScales
        .slice(0, BAR_COUNT)
        .map((scale) => clamp(scale, REACTIVE_BAR_MIN_SCALE, REACTIVE_BAR_MAX_SCALE));
    }

    const silenceReferenceMs = Number.isFinite(this.lastSignalAtMs)
      ? this.lastSignalAtMs
      : this.visibleSinceMs;
    if (input.hasAnalyser && Number.isFinite(silenceReferenceMs) && input.nowMs - silenceReferenceMs > LOW_IDLE_DELAY_MS) {
      return Array.from({ length: BAR_COUNT }, () => LOW_IDLE_BAR_SCALE);
    }

    return this.getIdleWaveScales(input.nowMs);
  }

  private getIdleWaveScales(nowMs: number): number[] {
    const scales: number[] = [];
    for (let index = 0; index < BAR_COUNT; index += 1) {
      const delayedMs = nowMs + BAR_DELAYS_MS[index];
      const progressInCycle =
        (((delayedMs % IDLE_BAR_CYCLE_MS) + IDLE_BAR_CYCLE_MS) % IDLE_BAR_CYCLE_MS) /
        IDLE_BAR_CYCLE_MS;
      const pingPongProgress = progressInCycle <= 0.5 ? progressInCycle * 2 : (1 - progressInCycle) * 2;
      const easedProgress = Phaser.Math.Easing.Sine.InOut(pingPongProgress);
      scales.push(Phaser.Math.Linear(IDLE_BAR_MIN_SCALE, IDLE_BAR_MAX_SCALE, easedProgress));
    }
    return scales;
  }

  private setVisibleTarget(visible: boolean): void {
    if (this.targetVisible === visible) {
      return;
    }

    this.targetVisible = visible;
    this.fadeTween?.stop();
    this.fadeTween = null;

    if (visible) {
      this.container.setVisible(true);
      this.fadeTween = this.scene.tweens.add({
        targets: this.container,
        alpha: 1,
        duration: BUBBLE_FADE_IN_MS,
        ease: 'Sine.Out',
        onComplete: () => {
          this.fadeTween = null;
        },
      });
      return;
    }

    this.fadeTween = this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: BUBBLE_FADE_OUT_MS,
      ease: 'Sine.In',
      onComplete: () => {
        this.fadeTween = null;
        if (!this.targetVisible) {
          this.container.setVisible(false);
        }
      },
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
