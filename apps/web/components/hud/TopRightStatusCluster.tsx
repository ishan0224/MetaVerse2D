'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { HudCircle } from '@/components/ui';
import {
  AVATAR_WALK_FRAMES,
  normalizeAvatarId,
} from '@/game/config/characterSpriteConfig';
import { numberToHexColor } from '@/lib/colorUtils';
import { getRuntimeUiState, type SocketUiStatus, subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';
import {
  buildSpriteFrameStyle,
  loadSpriteSheetMetrics,
  type SpriteSheetMetrics,
} from '@/lib/spriteUtils';

const DEFAULT_ROOM_LABEL = '#1';
const SPRITE_PREVIEW_SCALE = 1.5;

type TopRightStatusClusterProps = {
  touchOptimized?: boolean;
};

export function TopRightStatusCluster({ touchOptimized = false }: TopRightStatusClusterProps) {
  const state = useSyncExternalStore(subscribeToRuntimeUiState, getRuntimeUiState, getRuntimeUiState);
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  const [spriteSheetMetrics, setSpriteSheetMetrics] = useState<SpriteSheetMetrics | null>(null);
  const roomLabel = formatRoomId(state.roomId);
  const populationLabel = String(state.roomPopulation);
  const normalizedAvatarId = normalizeAvatarId(state.avatarId);
  const avatarStandingFrame = AVATAR_WALK_FRAMES[normalizedAvatarId].down.start;
  const avatarSpriteStyle = spriteSheetMetrics
    ? buildSpriteFrameStyle(avatarStandingFrame, spriteSheetMetrics, SPRITE_PREVIEW_SCALE)
    : null;

  useEffect(() => {
    setAvatarImageFailed(false);
  }, [state.avatarUrl]);

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
        console.error('top-right avatar sprite preview unavailable', error);
        setSpriteSheetMetrics(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const shellTextClass = touchOptimized ? 'text-xs font-semibold text-zinc-100' : 'text-[11px] font-semibold text-zinc-100 sm:text-xs';
  const safeAreaStyle = touchOptimized
    ? {
        paddingRight: 'max(0px, env(safe-area-inset-right))',
        paddingTop: 'max(0px, env(safe-area-inset-top))',
      }
    : undefined;

  return (
    <div
      className={`pointer-events-none absolute z-20 flex items-center gap-2 ${touchOptimized ? 'right-2 top-2' : 'right-3 top-3 sm:right-4 sm:top-4'}`}
      style={safeAreaStyle}
    >
      <HudCircle
        size={touchOptimized ? 'lg' : 'sm'}
        className="border-white/15 bg-black/40 shadow-sm"
      >
        <span className={shellTextClass}>{roomLabel}</span>
      </HudCircle>

      <HudCircle
        size={touchOptimized ? 'lg' : 'sm'}
        className="border-white/15 bg-black/40 shadow-sm"
      >
        <div className="flex items-center gap-1">
          <span
            className={`inline-block h-2 w-2 rounded-full ${getConnectionDotClass(state.socketStatus)}`}
          />
          <span className={shellTextClass}>{populationLabel}</span>
        </div>
      </HudCircle>

      <HudCircle
        size={touchOptimized ? 'lg' : 'sm'}
        className="border-white/15 bg-black/40 shadow-sm"
      >
        {state.avatarUrl && !avatarImageFailed ? (
          <img
            src={state.avatarUrl}
            alt="Player avatar"
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => {
              setAvatarImageFailed(true);
            }}
          />
        ) : avatarSpriteStyle ? (
          <div className="rounded-sm" style={avatarSpriteStyle} />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-transparent">
            <div
              className="h-5 w-5 rounded-sm"
              style={{
                backgroundColor: numberToHexColor(state.playerColor),
              }}
            />
          </div>
        )}
      </HudCircle>
    </div>
  );
}

function formatRoomId(roomId: string): string {
  const trimmed = roomId.trim();
  if (!trimmed) {
    return DEFAULT_ROOM_LABEL;
  }

  const numericRoomId = Number.parseInt(trimmed, 10);
  if (Number.isNaN(numericRoomId) || numericRoomId < 1) {
    return DEFAULT_ROOM_LABEL;
  }

  return `#${numericRoomId}`;
}

function getConnectionDotClass(status: SocketUiStatus): string {
  if (status === 'CONNECTED') {
    return 'bg-emerald-500';
  }

  if (status === 'CONNECTING' || status === 'RECONNECTING') {
    return 'bg-amber-400';
  }

  return 'bg-rose-500';
}
