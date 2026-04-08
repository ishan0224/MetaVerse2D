'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { ENABLE_TEST_MINIMAP } from '@/config/features';
import { numberToHexColor } from '@/lib/colorUtils';
import { getRuntimeUiState, subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';

import { getRasterizedMinimapMap } from '../minimapTilemapRasterizer';
import {
  createCircularMinimapLayout,
  getContentOffsetForFocus,
  toMinimapContentPoint,
  type WorldPoint,
} from '../minimapTransform';

const MINIMAP_VIEWPORT_SIZE = 150;
const MINIMAP_WORLD_TO_VIEW_SCALE = 0.12;

export function CircularMinimap() {
  const state = useSyncExternalStore(subscribeToRuntimeUiState, getRuntimeUiState, getRuntimeUiState);
  const [rasterizedMapDataUrl, setRasterizedMapDataUrl] = useState<string | null>(null);
  const [rasterizedMapError, setRasterizedMapError] = useState<string | null>(null);
  const localMarker = state.minimap.players.find((player) => player.id === state.minimap.localPlayerId);

  const layout = createCircularMinimapLayout({
    viewportSize: MINIMAP_VIEWPORT_SIZE,
    worldWidth: state.minimap.worldWidth,
    worldHeight: state.minimap.worldHeight,
    worldToMinimapScale: MINIMAP_WORLD_TO_VIEW_SCALE,
  });

  const focusPoint: WorldPoint = localMarker
    ? { x: localMarker.x, y: localMarker.y }
    : { x: layout.worldWidth / 2, y: layout.worldHeight / 2 };
  const contentOffset = getContentOffsetForFocus(focusPoint, layout);
  const contentWidth = Math.max(1, Math.round(layout.contentWidth));
  const contentHeight = Math.max(1, Math.round(layout.contentHeight));

  useEffect(() => {
    if (!ENABLE_TEST_MINIMAP) {
      return () => {};
    }

    let cancelled = false;

    void getRasterizedMinimapMap(contentWidth, contentHeight)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setRasterizedMapDataUrl(result.dataUrl);
        setRasterizedMapError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error('minimap rasterization failed', error);
        setRasterizedMapDataUrl(null);
        setRasterizedMapError('Map unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [contentHeight, contentWidth]);

  if (!ENABLE_TEST_MINIMAP || !localMarker) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-4 right-3 z-20 sm:bottom-5 sm:right-4">
      <div className="relative h-[150px] w-[150px] overflow-hidden rounded-full border border-white/20 bg-black/60 shadow-md backdrop-blur">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, rgba(15,23,42,0.9) 0%, rgba(9,9,11,0.92) 65%, rgba(0,0,0,0.96) 100%)',
          }}
        />

        <div
          className="absolute border border-white/10"
          style={{
            width: `${contentWidth}px`,
            height: `${contentHeight}px`,
            transform: `translate(${contentOffset.x}px, ${contentOffset.y}px)`,
            backgroundColor: 'rgba(9, 9, 11, 0.35)',
          }}
        >
          {rasterizedMapDataUrl ? (
            <img
              src={rasterizedMapDataUrl}
              alt="World minimap"
              className="pointer-events-none h-full w-full select-none"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          ) : null}

          {state.minimap.players.map((player) => {
            const contentPoint = toMinimapContentPoint({ x: player.x, y: player.y }, layout);
            const isLocal = player.id === state.minimap.localPlayerId;

            return (
              <span
                key={player.id}
                className={`absolute block rounded-full ${isLocal ? 'h-2.5 w-2.5 ring-1 ring-white/70' : 'h-2 w-2 opacity-90'}`}
                style={{
                  left: `${contentPoint.x}px`,
                  top: `${contentPoint.y}px`,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: isLocal ? '#22c55e' : numberToHexColor(player.color),
                }}
              />
            );
          })}
        </div>

        <div className="absolute inset-0 rounded-full ring-1 ring-white/15" />
        {rasterizedMapError ? (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium text-zinc-300">
            {rasterizedMapError}
          </div>
        ) : null}
        {/* <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-wide text-zinc-200">
          Test MiniMap
        </div> */}
      </div>
    </div>
  );
}
