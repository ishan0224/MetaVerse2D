export type WorldPoint = {
  x: number;
  y: number;
};

export type CircularMinimapLayout = {
  viewportSize: number;
  contentWidth: number;
  contentHeight: number;
  worldWidth: number;
  worldHeight: number;
};

type CircularMinimapLayoutInput = {
  viewportSize: number;
  worldWidth: number;
  worldHeight: number;
  worldToMinimapScale: number;
};

export function createCircularMinimapLayout(
  input: CircularMinimapLayoutInput,
): CircularMinimapLayout {
  const safeWorldWidth = Math.max(1, input.worldWidth);
  const safeWorldHeight = Math.max(1, input.worldHeight);
  const safeScale = Math.max(0.001, input.worldToMinimapScale);
  const safeViewportSize = Math.max(1, input.viewportSize);

  return {
    viewportSize: safeViewportSize,
    contentWidth: Math.max(1, safeWorldWidth * safeScale),
    contentHeight: Math.max(1, safeWorldHeight * safeScale),
    worldWidth: safeWorldWidth,
    worldHeight: safeWorldHeight,
  };
}

export function toMinimapContentPoint(
  point: WorldPoint,
  layout: CircularMinimapLayout,
): WorldPoint {
  return {
    x: (point.x / layout.worldWidth) * layout.contentWidth,
    y: (point.y / layout.worldHeight) * layout.contentHeight,
  };
}

export function getContentOffsetForFocus(
  focusPoint: WorldPoint,
  layout: CircularMinimapLayout,
): WorldPoint {
  const focusInContent = toMinimapContentPoint(focusPoint, layout);
  const targetCenter = layout.viewportSize / 2;
  const unclampedOffsetX = targetCenter - focusInContent.x;
  const unclampedOffsetY = targetCenter - focusInContent.y;

  return {
    x: roundForRendering(clampOffset(unclampedOffsetX, layout.viewportSize, layout.contentWidth)),
    y: roundForRendering(clampOffset(unclampedOffsetY, layout.viewportSize, layout.contentHeight)),
  };
}

function clampOffset(offset: number, viewportSize: number, contentSize: number): number {
  if (contentSize <= viewportSize) {
    return (viewportSize - contentSize) / 2;
  }

  const minOffset = viewportSize - contentSize;
  const maxOffset = 0;
  return Math.max(minOffset, Math.min(maxOffset, offset));
}

function roundForRendering(value: number): number {
  return Math.round(value * 100) / 100;
}
