import type { CSSProperties } from 'react';

import {
  CHARACTER_SPRITE_FRAME_HEIGHT,
  CHARACTER_SPRITE_FRAME_WIDTH,
  CHARACTER_SPRITE_SHEET_PATH,
} from '@/game/config/characterSpriteConfig';

export type SpriteSheetMetrics = {
  width: number;
  height: number;
  columns: number;
};

let spriteSheetMetricsPromise: Promise<SpriteSheetMetrics> | null = null;

export function loadSpriteSheetMetrics(): Promise<SpriteSheetMetrics> {
  if (!spriteSheetMetricsPromise) {
    spriteSheetMetricsPromise = new Promise<SpriteSheetMetrics>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const columns = Math.max(1, Math.floor(image.naturalWidth / CHARACTER_SPRITE_FRAME_WIDTH));
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          columns,
        });
      };
      image.onerror = () => {
        reject(new Error(`Failed to load character sprite sheet: ${CHARACTER_SPRITE_SHEET_PATH}`));
      };
      image.src = CHARACTER_SPRITE_SHEET_PATH;
    });
  }

  return spriteSheetMetricsPromise;
}

export function buildSpriteFrameStyle(
  frameIndex: number,
  metrics: SpriteSheetMetrics,
  scale: number,
): CSSProperties {
  const column = frameIndex % metrics.columns;
  const row = Math.floor(frameIndex / metrics.columns);
  const previewWidth = CHARACTER_SPRITE_FRAME_WIDTH * scale;
  const previewHeight = CHARACTER_SPRITE_FRAME_HEIGHT * scale;
  const scaledSheetWidth = metrics.width * scale;
  const scaledSheetHeight = metrics.height * scale;
  const offsetX = column * CHARACTER_SPRITE_FRAME_WIDTH * scale;
  const offsetY = row * CHARACTER_SPRITE_FRAME_HEIGHT * scale;

  return {
    width: `${previewWidth}px`,
    height: `${previewHeight}px`,
    backgroundImage: `url(${CHARACTER_SPRITE_SHEET_PATH})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${scaledSheetWidth}px ${scaledSheetHeight}px`,
    backgroundPosition: `-${offsetX}px -${offsetY}px`,
    imageRendering: 'pixelated',
  };
}
