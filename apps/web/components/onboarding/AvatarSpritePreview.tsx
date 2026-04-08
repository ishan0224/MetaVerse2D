'use client';

import { useEffect, useState } from 'react';

import {
  AVATAR_WALK_FRAMES,
  type AvatarId,
} from '@/game/config/characterSpriteConfig';
import {
  buildSpriteFrameStyle,
  loadSpriteSheetMetrics,
  type SpriteSheetMetrics,
} from '@/lib/spriteUtils';

const AVATAR_PREVIEW_SCALE = 7;
const AVATAR_ANIMATION_MS = 110;

type AvatarSpritePreviewProps = {
  avatarId: AvatarId;
};

export function AvatarSpritePreview({ avatarId }: AvatarSpritePreviewProps) {
  const [spriteSheetMetrics, setSpriteSheetMetrics] = useState<SpriteSheetMetrics | null>(null);
  const [frameOffset, setFrameOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadSpriteSheetMetrics()
      .then((metrics) => {
        if (cancelled) {
          return;
        }
        setSpriteSheetMetrics(metrics);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('onboarding avatar preview unavailable', error);
        setSpriteSheetMetrics(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!spriteSheetMetrics) {
      return;
    }

    const frameRange = AVATAR_WALK_FRAMES[avatarId].down;
    const frameCount = frameRange.end - frameRange.start + 1;
    setFrameOffset(0);
    const intervalId = window.setInterval(() => {
      setFrameOffset((previous) => (previous + 1) % frameCount);
    }, AVATAR_ANIMATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [avatarId, spriteSheetMetrics]);

  const frameRange = AVATAR_WALK_FRAMES[avatarId].down;
  const activeFrame = frameRange.start + frameOffset;
  const previewStyle = spriteSheetMetrics
    ? buildSpriteFrameStyle(activeFrame, spriteSheetMetrics, AVATAR_PREVIEW_SCALE)
    : null;

  if (!previewStyle) {
    return <div className="h-14 w-14 animate-pulse rounded-lg bg-cyan-400/40" />;
  }

  return <div className="rounded-sm" style={previewStyle} aria-label={`Avatar ${avatarId} preview`} />;
}
