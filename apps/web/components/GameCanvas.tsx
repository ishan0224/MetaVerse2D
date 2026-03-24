'use client';

import { useEffect, useRef } from 'react';

import { getSocketClient, setPlayerName } from '@/network';

type GameInstance = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
};

const PLAYER_NAME_STORAGE_KEY = 'metaverse2d:player-name';

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameInstance | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) {
      return;
    }

    let isMounted = true;

    const socket = getSocketClient();

    const requestedName = getOrRequestPlayerName();
    setPlayerName(requestedName);
    socket.connect();

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

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} className="h-screen w-full overflow-hidden" />;
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
