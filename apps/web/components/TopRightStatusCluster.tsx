'use client';

import { type ReactNode, useSyncExternalStore } from 'react';

import { getRuntimeUiState, type SocketUiStatus,subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';

const DEFAULT_ROOM_LABEL = '#1';

export function TopRightStatusCluster() {
  const state = useSyncExternalStore(subscribeToRuntimeUiState, getRuntimeUiState, getRuntimeUiState);
  const roomLabel = formatRoomId(state.roomId);
  const populationLabel = String(state.roomPopulation);

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-4 sm:top-4">
      <CircleShell>
        <span className="text-[11px] font-semibold text-zinc-900 sm:text-xs">{roomLabel}</span>
      </CircleShell>

      <CircleShell>
        <div className="flex items-center gap-1">
          <span
            className={`inline-block h-2 w-2 rounded-full ${getConnectionDotClass(state.socketStatus)}`}
          />
          <span className="text-[11px] font-semibold text-zinc-900 sm:text-xs">{populationLabel}</span>
        </div>
      </CircleShell>

      <CircleShell>
        {state.avatarUrl ? (
          <img
            src={state.avatarUrl}
            alt="Player avatar"
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-100">
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

function CircleShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-black/20 bg-white/95 shadow-md backdrop-blur sm:h-12 sm:w-12">
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
