export type MovementDirection = 'down' | 'right' | 'up' | 'left';

export type AvatarId = 1 | 2 | 3 | 4;

type FrameRange = {
  start: number;
  end: number;
};

export const CHARACTER_SPRITE_SHEET_KEY = 'characters-spritesheet';
export const CHARACTER_SPRITE_SHEET_PATH = '/sprites/character-spritesheet.png';
export const CHARACTER_SPRITE_FRAME_WIDTH = 16;
export const CHARACTER_SPRITE_FRAME_HEIGHT = 16;

export const DEFAULT_AVATAR_ID: AvatarId = 1;
export const AVATAR_IDS: readonly AvatarId[] = [1, 2, 3, 4] as const;

export const AVATAR_WALK_FRAMES: Record<AvatarId, Record<MovementDirection, FrameRange>> = {
  1: {
    down: { start: 936, end: 939 },
    right: { start: 975, end: 978 },
    up: { start: 1014, end: 1017 },
    left: { start: 1053, end: 1056 },
  },
  2: {
    down: { start: 940, end: 943 },
    right: { start: 979, end: 982 },
    up: { start: 1018, end: 1021 },
    left: { start: 1057, end: 1060 },
  },
  3: {
    down: { start: 944, end: 947 },
    right: { start: 983, end: 986 },
    up: { start: 1022, end: 1025 },
    left: { start: 1061, end: 1064 },
  },
  4: {
    down: { start: 948, end: 951 },
    right: { start: 987, end: 990 },
    up: { start: 1026, end: 1029 },
    left: { start: 1065, end: 1068 },
  },
};

export function normalizeAvatarId(avatarId: number | undefined | null): AvatarId {
  if (typeof avatarId !== 'number' || Number.isNaN(avatarId)) {
    return DEFAULT_AVATAR_ID;
  }

  const rounded = Math.round(avatarId);
  if (rounded <= 1) {
    return 1;
  }

  if (rounded >= 4) {
    return 4;
  }

  return rounded as AvatarId;
}

export function getIdleFrame(avatarId: AvatarId, direction: MovementDirection): number {
  return AVATAR_WALK_FRAMES[avatarId][direction].start;
}
