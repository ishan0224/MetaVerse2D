import type { InputState } from '@metaverse2d/shared/types/InputState';
import { io, type Socket } from 'socket.io-client';

import { webEnv } from '@/config/env';

type PlayerState = {
  id: string;
  x: number;
  y: number;
  name: string;
  color: number;
  roomId: string;
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
  join: (payload: { name: string; roomId: string }) => void;
  move: (payload: { playerId: string; input: InputState; delta: number }) => void;
  'webrtc:offer': (payload: { targetId: string; offer: WebRTCSessionDescription }) => void;
  'webrtc:answer': (payload: { targetId: string; answer: WebRTCSessionDescription }) => void;
  'webrtc:ice-candidate': (payload: { targetId: string; candidate: WebRTCIceCandidate }) => void;
};

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
let playerName: string | null = null;
let roomId: string | null = null;

export function getSocketClient(): GameSocket {
  if (!socket) {
    socket = io(webEnv.socketUrl, {
      autoConnect: false,
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('connected to server');
      if (playerName && roomId) {
        socket?.emit('join', { name: playerName, roomId });
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

export function setRoomId(nextRoomId: string): void {
  roomId = nextRoomId;
}

export function getRoomId(): string | null {
  return roomId;
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
