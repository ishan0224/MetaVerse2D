/** @module apps/web/network/socket/socketClient.ts */

import {
  CHAT_EVENT_MESSAGE,
  CHAT_EVENT_SEND,
  MAX_CHAT_TEXT_LENGTH,
  type RoomChatMessage,
  type RoomChatSendPayload,
} from '@metaverse2d/shared';
import type { InputState } from '@metaverse2d/shared/types/InputState';
import { io, type Socket } from 'socket.io-client';

import { webEnv } from '@/config/env';
import { getAuthAccessToken } from '@/network/auth/authSession';

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
  serverTimeMs?: number;
  lastProcessedInputSeq?: number;
};

type PlayersUpdatePayload = {
  snapshotSeq?: number;
  serverTimeMs?: number;
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
  [CHAT_EVENT_MESSAGE]: (payload: RoomChatMessage) => void;
};

type ClientToServerEvents = {
  join: (payload: {
    name: string;
    worldId: string;
    roomId: string;
    avatarId?: number;
    avatarUrl?: string;
  }) => void;
  move: (payload: {
    playerId: string;
    input: InputState;
    delta: number;
    inputSeq?: number;
    clientSentAtMs?: number;
  }) => void;
  'webrtc:offer': (payload: { targetId: string; offer: WebRTCSessionDescription }) => void;
  'webrtc:answer': (payload: { targetId: string; answer: WebRTCSessionDescription }) => void;
  'webrtc:ice-candidate': (payload: { targetId: string; candidate: WebRTCIceCandidate }) => void;
  [CHAT_EVENT_SEND]: (payload: RoomChatSendPayload) => void;
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
      auth: (callback) => {
        callback({ token: getAuthAccessToken() ?? undefined });
      },
    });

    socket.on('connect', () => {
      const transport = socket?.io?.engine?.transport?.name ?? 'unknown';
      console.log(`connected to server via ${transport}`);
      const accessToken = getAuthAccessToken();
      if (playerName && worldId && roomId && accessToken) {
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

export function sendInput(inputState: InputState, delta: number, inputSeq: number): void {
  const client = getSocketClient();
  if (!client.connected || !getAuthAccessToken()) {
    return;
  }

  const playerId = client.id ?? 'pending';

  client.emit('move', {
    playerId,
    input: inputState,
    delta,
    inputSeq,
    clientSentAtMs: Date.now(),
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

export function sendRoomChatMessage(text: string): boolean {
  const normalizedText = normalizeChatText(text);
  if (!normalizedText) {
    return false;
  }

  const client = getSocketClient();
  if (!client.connected || !getAuthAccessToken()) {
    return false;
  }

  client.emit(CHAT_EVENT_SEND, { text: normalizedText });
  return true;
}

export function listenToRoomChatMessages(
  callback: (payload: RoomChatMessage) => void,
): () => void {
  const client = getSocketClient();
  client.on(CHAT_EVENT_MESSAGE, callback);
  return () => {
    client.off(CHAT_EVENT_MESSAGE, callback);
  };
}

function normalizeChatText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.slice(0, MAX_CHAT_TEXT_LENGTH);
}
