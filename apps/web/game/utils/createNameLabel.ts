import * as Phaser from 'phaser';

const NAME_LABEL_OFFSET_Y = 26;

export function createNameLabel(
  scene: Phaser.Scene,
  name: string,
  x: number,
  y: number,
): Phaser.GameObjects.Text {
  const label = scene.add.text(x, y - NAME_LABEL_OFFSET_Y, name, {
    fontSize: '14px',
    color: '#e5e7eb',
    stroke: '#111827',
    strokeThickness: 3,
  });

  label.setOrigin(0.5, 1);
  return label;
}

export function updateNameLabelPosition(
  label: Phaser.GameObjects.Text,
  x: number,
  y: number,
): void {
  label.setPosition(x, y - NAME_LABEL_OFFSET_Y);
}
