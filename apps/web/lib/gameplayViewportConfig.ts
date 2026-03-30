export const GAMEPLAY_VIEWPORT_CONFIG = {
  targetAspectRatio: 16 / 9,
  minFrameWidth: 320,
  minFrameHeight: 180,
  touchDeviceMaxEdge: 1366,
  phoneMaxEdge: 900,
} as const;

export type GameplayDeviceClass = 'desktop' | 'phone' | 'tablet';

export type GameplayViewportSnapshot = {
  viewportWidth: number;
  viewportHeight: number;
  frameWidth: number;
  frameHeight: number;
  targetAspectRatio: number;
  isTouchDevice: boolean;
  isLandscape: boolean;
  isMobileOrTablet: boolean;
  requiresLandscapePrompt: boolean;
  deviceClass: GameplayDeviceClass;
};

type ResolveGameplayViewportInput = {
  viewportWidth: number;
  viewportHeight: number;
  isTouchDevice: boolean;
};

export function detectTouchDevice(windowObject: Window): boolean {
  const coarsePointer = windowObject.matchMedia?.('(pointer: coarse)').matches ?? false;
  const hasTouchStart = 'ontouchstart' in windowObject;
  const maxTouchPoints = windowObject.navigator?.maxTouchPoints ?? 0;
  return coarsePointer || hasTouchStart || maxTouchPoints > 0;
}

export function resolveGameplayViewportSnapshot(
  input: ResolveGameplayViewportInput,
): GameplayViewportSnapshot {
  const viewportWidth = Math.max(1, Math.round(input.viewportWidth));
  const viewportHeight = Math.max(1, Math.round(input.viewportHeight));
  const longestEdge = Math.max(viewportWidth, viewportHeight);
  const isLandscape = viewportWidth >= viewportHeight;
  const isMobileOrTablet = input.isTouchDevice && longestEdge <= GAMEPLAY_VIEWPORT_CONFIG.touchDeviceMaxEdge;

  let deviceClass: GameplayDeviceClass = 'desktop';
  if (isMobileOrTablet) {
    deviceClass = longestEdge <= GAMEPLAY_VIEWPORT_CONFIG.phoneMaxEdge ? 'phone' : 'tablet';
  }

  const fittedFrame = fitFrameToViewport(
    viewportWidth,
    viewportHeight,
    GAMEPLAY_VIEWPORT_CONFIG.targetAspectRatio,
  );

  return {
    viewportWidth,
    viewportHeight,
    frameWidth: fittedFrame.width,
    frameHeight: fittedFrame.height,
    targetAspectRatio: GAMEPLAY_VIEWPORT_CONFIG.targetAspectRatio,
    isTouchDevice: input.isTouchDevice,
    isLandscape,
    isMobileOrTablet,
    requiresLandscapePrompt: isMobileOrTablet && !isLandscape,
    deviceClass,
  };
}

function fitFrameToViewport(
  viewportWidth: number,
  viewportHeight: number,
  aspectRatio: number,
): { width: number; height: number } {
  const widthLimitedHeight = viewportWidth / aspectRatio;
  const useWidthAsConstraint = widthLimitedHeight <= viewportHeight;

  const width = useWidthAsConstraint ? viewportWidth : viewportHeight * aspectRatio;
  const height = useWidthAsConstraint ? widthLimitedHeight : viewportHeight;
  const roundedWidth = Math.round(width);
  const roundedHeight = Math.round(height);
  const clampedWidth = Math.min(
    viewportWidth,
    Math.max(GAMEPLAY_VIEWPORT_CONFIG.minFrameWidth, roundedWidth),
  );
  const clampedHeight = Math.min(
    viewportHeight,
    Math.max(GAMEPLAY_VIEWPORT_CONFIG.minFrameHeight, roundedHeight),
  );

  return {
    width: clampedWidth,
    height: clampedHeight,
  };
}
