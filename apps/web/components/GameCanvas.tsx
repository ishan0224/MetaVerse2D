'use client';

import { useEffect, useRef, useState } from 'react';

import { getClientPlayerId, getSocketClient, listenToPlayerUpdates, setPlayerName, setRoomId } from '@/network';
import { getRTCManager } from '@/network/rtc/rtcManager';

type GameInstance = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
};

const PLAYER_NAME_STORAGE_KEY = 'metaverse2d:player-name';
const ROOM_ID_STORAGE_KEY = 'metaverse2d:room-id';
const DEFAULT_ROOM_ID = 'lobby';

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameInstance | null>(null);
  const [voiceTargetId, setVoiceTargetId] = useState('');
  const [voiceTargets, setVoiceTargets] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) {
      return;
    }

    let isMounted = true;

    const socket = getSocketClient();
    const rtcManager = getRTCManager();

    const requestedName = getOrRequestPlayerName();
    const requestedRoomId = getOrRequestRoomId();
    setPlayerName(requestedName);
    setRoomId(requestedRoomId);
    rtcManager.initialize();
    socket.connect();
    const unsubscribePlayers = listenToPlayerUpdates((payload) => {
      const clientPlayerId = getClientPlayerId();
      const nextTargets = payload.players
        .filter((player) => player.id !== clientPlayerId)
        .map((player) => ({ id: player.id, name: player.name }));

      setVoiceTargets(nextTargets);
      setVoiceTargetId((currentTargetId) => {
        if (nextTargets.some((target) => target.id === currentTargetId)) {
          return currentTargetId;
        }

        return nextTargets[0]?.id ?? '';
      });
    });

    void (async () => {
      const { initializeGame } = await import('@/game');
      if (!isMounted) {
        return;
      }

      gameRef.current = initializeGame(container);
    })();

    return () => {
      isMounted = false;

      if (socket.connected) {
        socket.disconnect();
      }

      rtcManager.destroy();
      unsubscribePlayers();

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded bg-black/60 p-2">
        <select
          value={voiceTargetId}
          onChange={(event) => {
            setVoiceTargetId(event.target.value);
          }}
          className="w-64 rounded bg-white px-2 py-1 text-sm text-black"
          disabled={voiceTargets.length === 0}
        >
          {voiceTargets.length === 0 ? <option value="">No players in room</option> : null}
          {voiceTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name} ({target.id.slice(0, 6)})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const targetId = voiceTargetId.trim();
            if (!targetId) {
              return;
            }

            void getRTCManager().createConnection(targetId);
          }}
          className="rounded bg-emerald-500 px-2 py-1 text-sm text-white"
        >
          Connect Voice
        </button>
        <button
          type="button"
          onClick={() => {
            const targetId = voiceTargetId.trim();
            if (!targetId) {
              return;
            }

            getRTCManager().closeConnection(targetId);
          }}
          className="rounded bg-zinc-600 px-2 py-1 text-sm text-white"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function requestPlayerName(): string {
  while (true) {
    const input = window.prompt('Enter your player name');
    const name = input?.trim();

    if (name) {
      return name;
    }
  }
}

function getOrRequestPlayerName(): string {
  const cachedName = window.sessionStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim();
  if (cachedName) {
    return cachedName;
  }

  const name = requestPlayerName();
  window.sessionStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
  return name;
}

function requestRoomId(): string {
  const input = window.prompt('Enter room ID', DEFAULT_ROOM_ID);
  const roomId = input?.trim();
  return roomId || DEFAULT_ROOM_ID;
}

function getOrRequestRoomId(): string {
  const cachedRoomId = window.sessionStorage.getItem(ROOM_ID_STORAGE_KEY)?.trim();
  if (cachedRoomId) {
    return cachedRoomId;
  }

  const roomId = requestRoomId();
  window.sessionStorage.setItem(ROOM_ID_STORAGE_KEY, roomId);
  return roomId;
}
