import type { NearbyPlayersMap } from '@metaverse2d/shared';
import type { InputState } from '@metaverse2d/shared';
import type { Server as SocketIOServer, Socket } from 'socket.io';

import { PlayerManager } from '../domain/playerManager';
import { ProximitySystem } from '../domain/proximitySystem';
import { getSpawnPositionForRoom } from '../domain/spawnSystem';

type MovePayload = {
  playerId: string;
  input: InputState;
  delta: number;
};

type SessionDescriptionPayload = {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
};

type IceCandidatePayload = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

type JoinPayload = {
  name: string;
  roomId: string;
};

type WebRTCOfferPayload = {
  targetId: string;
  offer: SessionDescriptionPayload;
};

type WebRTCAnswerPayload = {
  targetId: string;
  answer: SessionDescriptionPayload;
};

type WebRTCIceCandidateRelayPayload = {
  targetId: string;
  candidate: IceCandidatePayload;
};

type PlayersUpdatePayload = {
  players: Array<{
    id: string;
    x: number;
    y: number;
    name: string;
    color: number;
    roomId: string;
    timestamp: number;
  }>;
  proximity: NearbyPlayersMap;
};

const PLAYERS_UPDATE_EVENT = 'players:update';
const MOVE_EVENT = 'move';
const JOIN_EVENT = 'join';
const WEBRTC_OFFER_EVENT = 'webrtc:offer';
const WEBRTC_ANSWER_EVENT = 'webrtc:answer';
const WEBRTC_ICE_CANDIDATE_EVENT = 'webrtc:ice-candidate';
const playerManager = new PlayerManager();
const proximitySystem = new ProximitySystem();
const DEFAULT_ROOM_ID = 'lobby';

function buildPlayersUpdatePayload(roomId: string): PlayersUpdatePayload {
  const roomPlayers = playerManager.getPlayersInRoom(roomId);
  const proximity = proximitySystem.updateRoom(roomId, roomPlayers);

  return {
    players: roomPlayers.map((player) => ({
      id: player.id,
      x: player.x,
      y: player.y,
      name: player.name,
      color: player.color,
      roomId: player.roomId,
      timestamp: Date.now(),
    })),
    proximity,
  };
}

export function registerSocketHandlers(io: SocketIOServer, socket: Socket): void {
  console.log(`user connected: ${socket.id}`);

  const relayWebRTCSignal = (
    fromId: string,
    targetId: string | undefined,
    eventName: string,
    payload: Record<string, unknown>,
  ): void => {
    if (!targetId || targetId === fromId) {
      return;
    }

    const sourceRoomId = playerManager.getPlayerRoomId(fromId);
    const targetRoomId = playerManager.getPlayerRoomId(targetId);
    if (!sourceRoomId || !targetRoomId || sourceRoomId !== targetRoomId) {
      return;
    }

    io.to(targetId).emit(eventName, payload);
  };

  socket.on(JOIN_EVENT, (payload: JoinPayload) => {
    const playerName = payload?.name?.trim();
    const roomId = normalizeRoomId(payload?.roomId);
    if (!playerName) {
      return;
    }

    const previousRoomId = playerManager.getPlayerRoomId(socket.id);
    if (previousRoomId) {
      playerManager.removePlayer(socket.id);
      socket.leave(previousRoomId);
      io.to(previousRoomId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(previousRoomId));
    }

    playerManager.createRoom(roomId);
    const spawnPosition = getSpawnPositionForRoom(playerManager.getPlayersInRoom(roomId));
    const player = playerManager.addPlayer(socket.id, playerName, roomId, spawnPosition.x, spawnPosition.y);

    socket.join(roomId);
    io.to(roomId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(player.roomId));
  });

  socket.on(MOVE_EVENT, (payload: MovePayload) => {
    if (!payload || !payload.input || typeof payload.delta !== 'number') {
      return;
    }

    if (payload.playerId !== socket.id) {
      return;
    }

    const updatedPlayer = playerManager.updatePlayer(socket.id, payload.input, payload.delta);
    if (!updatedPlayer) {
      return;
    }

    io.to(updatedPlayer.roomId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(updatedPlayer.roomId));
  });

  socket.on('disconnect', () => {
    const roomId = playerManager.removePlayer(socket.id);
    console.log(`user disconnected: ${socket.id}`);

    if (roomId) {
      io.to(roomId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(roomId));
    }
  });

  socket.on(WEBRTC_OFFER_EVENT, (payload: WebRTCOfferPayload) => {
    relayWebRTCSignal(socket.id, payload?.targetId, WEBRTC_OFFER_EVENT, {
      fromId: socket.id,
      offer: payload?.offer,
    });
  });

  socket.on(WEBRTC_ANSWER_EVENT, (payload: WebRTCAnswerPayload) => {
    relayWebRTCSignal(socket.id, payload?.targetId, WEBRTC_ANSWER_EVENT, {
      fromId: socket.id,
      answer: payload?.answer,
    });
  });

  socket.on(WEBRTC_ICE_CANDIDATE_EVENT, (payload: WebRTCIceCandidateRelayPayload) => {
    relayWebRTCSignal(socket.id, payload?.targetId, WEBRTC_ICE_CANDIDATE_EVENT, {
      fromId: socket.id,
      candidate: payload?.candidate,
    });
  });
}

function normalizeRoomId(roomId: string | undefined): string {
  const trimmed = roomId?.trim();
  return trimmed ? trimmed : DEFAULT_ROOM_ID;
}
