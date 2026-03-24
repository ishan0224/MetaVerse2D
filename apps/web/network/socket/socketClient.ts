import type { InputState } from '@metaverse2d/shared/types/InputState';
import { io, type Socket } from 'socket.io-client';

import { webEnv } from '@/config/env';

type PlayerState = {
  id: string;
  x: number;
  y: number;
  name: string;
  color: number;
};

type PlayersUpdatePayload = {
  players: PlayerState[];
};

type ServerToClientEvents = {
  'players:update': (payload: PlayersUpdatePayload) => void;
};

type ClientToServerEvents = {
  join: (payload: { name: string }) => void;
  move: (payload: { playerId: string; input: InputState; delta: number }) => void;
};

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
let playerName: string | null = null;

export function getSocketClient(): GameSocket {
  if (!socket) {
    socket = io(webEnv.socketUrl, {
      autoConnect: false,
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('connected to server');
      if (playerName) {
        socket?.emit('join', { name: playerName });
      }
    });

    socket.on('disconnect', () => {
      console.log('disconnected from server');
    });
  }

  return socket;
}

export function setPlayerName(name: string): void {
  playerName = name;
}

export function sendInput(inputState: InputState, delta: number): void {
  const client = getSocketClient();
  const playerId = client.id ?? 'pending';

  client.emit('move', {
    playerId,
    input: inputState,
    delta,
  });
}

export function listenToPlayerUpdates(
  callback: (payload: PlayersUpdatePayload) => void,
): () => void {
  const client = getSocketClient();
  client.on('players:update', callback);

  return () => {
    client.off('players:update', callback);
  };
}

export function getClientPlayerId(): string | null {
  return getSocketClient().id ?? null;
}
