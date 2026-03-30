'use client';

import { type CSSProperties, type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';

import {
  AVATAR_WALK_FRAMES,
  CHARACTER_SPRITE_FRAME_HEIGHT,
  CHARACTER_SPRITE_FRAME_WIDTH,
  CHARACTER_SPRITE_SHEET_PATH,
  normalizeAvatarId,
} from '@/game/config/characterSpriteConfig';
import { getRuntimeUiState, type SocketUiStatus, subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';

const DEFAULT_ROOM_LABEL = '#1';
const SPRITE_PREVIEW_SCALE = 1.5;

type SpriteSheetMetrics = {
  width: number;
  height: number;
  columns: number;
};

let spriteSheetMetricsPromise: Promise<SpriteSheetMetrics> | null = null;

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
    ? buildSpriteFrameStyle(avatarStandingFrame, spriteSheetMetrics)
    : null;

  useEffect(() => {
    setAvatarImageFailed(false);
  }, [state.avatarUrl]);

  useEffect(() => {
    let cancelled = false;

    void getSpriteSheetMetrics()
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
      <CircleShell touchOptimized={touchOptimized}>
        <span className={shellTextClass}>{roomLabel}</span>
      </CircleShell>

      <CircleShell touchOptimized={touchOptimized}>
        <div className="flex items-center gap-1">
          <span
            className={`inline-block h-2 w-2 rounded-full ${getConnectionDotClass(state.socketStatus)}`}
          />
          <span className={shellTextClass}>{populationLabel}</span>
        </div>
      </CircleShell>

      <CircleShell touchOptimized={touchOptimized}>
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
      </CircleShell>
    </div>
  );
}

function CircleShell({
  children,
  touchOptimized = false,
}: {
  children: ReactNode;
  touchOptimized?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full border border-white/15 bg-black/40 shadow-sm backdrop-blur ${touchOptimized ? 'h-14 w-14' : 'h-11 w-11 sm:h-12 sm:w-12'}`}
    >
      {children}
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

function numberToHexColor(color: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, color >>> 0));
  return `#${clamped.toString(16).padStart(6, '0')}`;
}

function getSpriteSheetMetrics(): Promise<SpriteSheetMetrics> {
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

function buildSpriteFrameStyle(frameIndex: number, metrics: SpriteSheetMetrics): CSSProperties {
  const column = frameIndex % metrics.columns;
  const row = Math.floor(frameIndex / metrics.columns);
  const previewWidth = CHARACTER_SPRITE_FRAME_WIDTH * SPRITE_PREVIEW_SCALE;
  const previewHeight = CHARACTER_SPRITE_FRAME_HEIGHT * SPRITE_PREVIEW_SCALE;
  const scaledSheetWidth = metrics.width * SPRITE_PREVIEW_SCALE;
  const scaledSheetHeight = metrics.height * SPRITE_PREVIEW_SCALE;
  const offsetX = column * CHARACTER_SPRITE_FRAME_WIDTH * SPRITE_PREVIEW_SCALE;
  const offsetY = row * CHARACTER_SPRITE_FRAME_HEIGHT * SPRITE_PREVIEW_SCALE;

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
