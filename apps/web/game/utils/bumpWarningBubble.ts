import * as Phaser from 'phaser';

export const BUMP_WARNING_TEXT = 'Hey watch out';

const BUBBLE_PADDING_X = 12;
const BUBBLE_PADDING_Y = 8;
const BUBBLE_BORDER_RADIUS = 10;
const BUBBLE_BORDER_COLOR = 0x0f172a;
const BUBBLE_FILL_COLOR = 0xfefce8;
const BUBBLE_FILL_ALPHA = 0.96;
const BUBBLE_STROKE_ALPHA = 0.92;
const BUBBLE_OFFSET_X = 34;
const BUBBLE_OFFSET_Y = -34;

export type BumpWarningBubble = {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Graphics;
  tail: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  width: number;
  height: number;
};

export function createBumpWarningBubble(
  scene: Phaser.Scene,
  text: string = BUMP_WARNING_TEXT,
): BumpWarningBubble {
  const label = scene.add.text(0, 0, text, {
    fontSize: '13px',
    fontStyle: '700',
    color: '#0f172a',
    stroke: '#f8fafc',
    strokeThickness: 2,
  });
  label.setOrigin(0.5, 0.5);

  const bubbleWidth = Math.ceil(label.width + BUBBLE_PADDING_X * 2);
  const bubbleHeight = Math.ceil(label.height + BUBBLE_PADDING_Y * 2);
  const body = scene.add.graphics();
  const tail = scene.add.graphics();

  body
    .fillStyle(BUBBLE_FILL_COLOR, BUBBLE_FILL_ALPHA)
    .lineStyle(2, BUBBLE_BORDER_COLOR, BUBBLE_STROKE_ALPHA)
    .fillRoundedRect(-bubbleWidth / 2, -bubbleHeight, bubbleWidth, bubbleHeight, BUBBLE_BORDER_RADIUS)
    .strokeRoundedRect(-bubbleWidth / 2, -bubbleHeight, bubbleWidth, bubbleHeight, BUBBLE_BORDER_RADIUS);

  const tailBaseX = -bubbleWidth * 0.2;
  const tailBaseY = 0;
  tail
    .fillStyle(BUBBLE_FILL_COLOR, BUBBLE_FILL_ALPHA)
    .lineStyle(2, BUBBLE_BORDER_COLOR, BUBBLE_STROKE_ALPHA)
    .beginPath()
    .moveTo(tailBaseX, tailBaseY)
    .lineTo(tailBaseX + 11, tailBaseY)
    .lineTo(tailBaseX - 6, tailBaseY + 12)
    .closePath()
    .fillPath()
    .strokePath();

  label.setPosition(0, -bubbleHeight / 2);

  const container = scene.add.container(0, 0, [body, tail, label]);
  container.setVisible(false);

  return {
    container,
    body,
    tail,
    label,
    width: bubbleWidth,
    height: bubbleHeight,
  };
}

export function updateBumpWarningBubblePosition(
  bubble: BumpWarningBubble,
  position: { x: number; y: number },
): void {
  bubble.container.setPosition(position.x + BUBBLE_OFFSET_X, position.y + BUBBLE_OFFSET_Y);
}

export function setBumpWarningBubbleDepth(
  bubble: BumpWarningBubble,
  playerDepth: number,
): void {
  bubble.container.setDepth(playerDepth + 4);
}

export function showBumpWarningBubble(bubble: BumpWarningBubble): void {
  bubble.container.setVisible(true);
}

export function hideBumpWarningBubble(bubble: BumpWarningBubble): void {
  bubble.container.setVisible(false);
}

export function destroyBumpWarningBubble(bubble: BumpWarningBubble): void {
  bubble.container.destroy(true);
}
