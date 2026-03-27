import type { InputState } from '@metaverse2d/shared/types/InputState';
import { io, type Socket } from 'socket.io-client';

import { webEnv } from '@/config/env';

type PlayerState = {
  id: string;
  x: number;
  y: number;
  name: string;
  worldId: string;
  color: number;
  roomId: string;
  avatarId?: number;
  avatarUrl?: string;
  timestamp: number;
};

type PlayersUpdatePayload = {
  players: PlayerState[];
  proximity: Record<string, string[]>;
};

export type WebRTCSessionDescription = {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
};

export type WebRTCIceCandidate = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

type ServerToClientEvents = {
  'players:update': (payload: PlayersUpdatePayload) => void;
  'webrtc:offer': (payload: { fromId: string; offer: WebRTCSessionDescription }) => void;
  'webrtc:answer': (payload: { fromId: string; answer: WebRTCSessionDescription }) => void;
  'webrtc:ice-candidate': (payload: { fromId: string; candidate: WebRTCIceCandidate }) => void;
};

type ClientToServerEvents = {
  join: (payload: {
    name: string;
    worldId: string;
    roomId: string;
    avatarId?: number;
    avatarUrl?: string;
  }) => void;
  move: (payload: { playerId: string; input: InputState; delta: number }) => void;
  'webrtc:offer': (payload: { targetId: string; offer: WebRTCSessionDescription }) => void;
  'webrtc:answer': (payload: { targetId: string; answer: WebRTCSessionDescription }) => void;
  'webrtc:ice-candidate': (payload: { targetId: string; candidate: WebRTCIceCandidate }) => void;
};

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
let playerName: string | null = null;
let worldId: string | null = null;
let roomId: string | null = null;
let playerAvatarId: number | null = null;
let playerAvatarUrl: string | null = null;

export function getSocketClient(): GameSocket {
  if (!socket) {
    socket = io(webEnv.socketUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      const transport = socket?.io?.engine?.transport?.name ?? 'unknown';
      console.log(`connected to server via ${transport}`);
      if (playerName && worldId && roomId) {
        socket?.emit('join', {
          name: playerName,
          worldId,
          roomId,
          avatarId: playerAvatarId ?? undefined,
          avatarUrl: playerAvatarUrl ?? undefined,
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('disconnected from server');
    });

    socket.on('connect_error', (error) => {
      const transport = socket?.io?.engine?.transport?.name ?? 'unknown';
      console.error(`socket connect error (${transport})`, error.message);
    });
  }

  return socket;
}

export function setPlayerName(name: string): void {
  playerName = name;
}

export function setWorldId(nextWorldId: string): void {
  worldId = nextWorldId;
}

export function setRoomId(nextRoomId: string): void {
  roomId = nextRoomId;
}

export function setPlayerAvatarUrl(avatarUrl: string | null): void {
  playerAvatarUrl = avatarUrl;
}

export function setPlayerAvatarId(avatarId: number): void {
  playerAvatarId = avatarId;
}

export function getRoomId(): string | null {
  return roomId;
}

export function getWorldId(): string | null {
  return worldId;
}

export function sendInput(inputState: InputState, delta: number): void {
  const client = getSocketClient();
  if (!client.connected) {
    return;
  }

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

export function sendWebRTCOffer(targetId: string, offer: WebRTCSessionDescription): void {
  getSocketClient().emit('webrtc:offer', { targetId, offer });
}

export function sendWebRTCAnswer(targetId: string, answer: WebRTCSessionDescription): void {
  getSocketClient().emit('webrtc:answer', { targetId, answer });
}

export function sendWebRTCIceCandidate(targetId: string, candidate: WebRTCIceCandidate): void {
  getSocketClient().emit('webrtc:ice-candidate', { targetId, candidate });
}

export function onWebRTCOffer(
  callback: (payload: { fromId: string; offer: WebRTCSessionDescription }) => void,
): () => void {
  const client = getSocketClient();
  client.on('webrtc:offer', callback);
  return () => {
    client.off('webrtc:offer', callback);
  };
}

export function onWebRTCAnswer(
  callback: (payload: { fromId: string; answer: WebRTCSessionDescription }) => void,
): () => void {
  const client = getSocketClient();
  client.on('webrtc:answer', callback);
  return () => {
    client.off('webrtc:answer', callback);
  };
}

export function onWebRTCIceCandidate(
  callback: (payload: { fromId: string; candidate: WebRTCIceCandidate }) => void,
): () => void {
  const client = getSocketClient();
  client.on('webrtc:ice-candidate', callback);
  return () => {
    client.off('webrtc:ice-candidate', callback);
  };
}
