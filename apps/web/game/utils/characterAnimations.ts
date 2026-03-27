import * as Phaser from 'phaser';

import {
  AVATAR_IDS,
  AVATAR_WALK_FRAMES,
  type AvatarId,
  CHARACTER_SPRITE_SHEET_KEY,
  type MovementDirection,
} from '@/game/config/characterSpriteConfig';

const WALK_ANIMATION_FRAME_RATE = 10;

export function getWalkAnimationKey(avatarId: AvatarId, direction: MovementDirection): string {
  return `avatar:${avatarId}:walk:${direction}`;
}

export function ensureCharacterAnimations(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(CHARACTER_SPRITE_SHEET_KEY)) {
    return false;
  }

  for (const avatarId of AVATAR_IDS) {
    for (const direction of Object.keys(AVATAR_WALK_FRAMES[avatarId]) as MovementDirection[]) {
      const animationKey = getWalkAnimationKey(avatarId, direction);
      if (scene.anims.exists(animationKey)) {
        continue;
      }

      const frameRange = AVATAR_WALK_FRAMES[avatarId][direction];
      scene.anims.create({
        key: animationKey,
        frames: scene.anims.generateFrameNumbers(CHARACTER_SPRITE_SHEET_KEY, {
          start: frameRange.start,
          end: frameRange.end,
        }),
        frameRate: WALK_ANIMATION_FRAME_RATE,
        repeat: -1,
      });
    }
  }

  return true;
}
