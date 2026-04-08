/** @module apps/server/src/socket/connectionHandlers.ts */

import {
  CHAT_EVENT_MESSAGE,
  CHAT_EVENT_SEND,
  type RoomChatMessage,
  type RoomChatSendPayload,
} from '@metaverse2d/shared';
import type { Server as SocketIOServer, Socket } from 'socket.io';

import type { AuthenticatedSupabaseUser } from '../auth/supabaseAuth';
import type { PlayerManager } from '../domain/playerManager';
import type { PlayerPersistenceService } from '../services/playerPersistenceService';
import { handleJoin } from './joinHandler';
import {
  buildScopeId,
  createRoomChatMessageId,
  isValidInputSeq,
  normalizeChatText,
  resolvePlayerName,
} from './normalizers';
import type {
  JoinPayload,
  MovePayload,
  PlayersUpdatePayload,
  WebRTCAnswerPayload,
  WebRTCIceCandidateRelayPayload,
  WebRTCOfferPayload,
} from './payloadTypes';
import {
  deleteLastProcessedInputSeq,
  deleteSocketPersistenceUserId,
  getLastProcessedInputSeq,
  getSocketPersistenceUserId,
  setLastProcessedInputSeq,
} from './sessionState';

const MOVE_EVENT = 'move';
const JOIN_EVENT = 'join';
const WEBRTC_OFFER_EVENT = 'webrtc:offer';
const WEBRTC_ANSWER_EVENT = 'webrtc:answer';
const WEBRTC_ICE_CANDIDATE_EVENT = 'webrtc:ice-candidate';

type RegisterConnectionHandlersOptions = {
  io: SocketIOServer;
  socket: Socket;
  playerManager: PlayerManager;
  playerPersistenceService: PlayerPersistenceService;
  buildPlayersUpdatePayload: (scopeId: string) => PlayersUpdatePayload;
  playersUpdateEventName: string;
};

export function registerConnectionHandlers({
  io,
  socket,
  playerManager,
  playerPersistenceService,
  buildPlayersUpdatePayload,
  playersUpdateEventName,
}: RegisterConnectionHandlersOptions): void {
  const authUser = getSocketAuthUser(socket);
  if (!authUser) {
    socket.disconnect(true);
    return;
  }

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

    const sourceScopeId = playerManager.getPlayerScopeId(fromId);
    const targetScopeId = playerManager.getPlayerScopeId(targetId);
    if (!sourceScopeId || !targetScopeId || sourceScopeId !== targetScopeId) {
      return;
    }

    io.to(targetId).emit(eventName, payload);
  };

  socket.on(JOIN_EVENT, (payload: JoinPayload) => {
    void handleJoin({
      authUser,
      buildPlayersUpdatePayload,
      io,
      payload,
      playerManager,
      playerPersistenceService,
      playersUpdateEventName,
      socket,
    }).catch((error) => {
      console.error('[socket] join handler failed', {
        event: JOIN_EVENT,
        socketId: socket.id,
        error,
      });
    });
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

    if (!isValidInputSeq(payload.inputSeq)) {
      return;
    }

    const previousInputSeq = getLastProcessedInputSeq(socket.id) ?? 0;
    if (payload.inputSeq > previousInputSeq) {
      setLastProcessedInputSeq(socket.id, payload.inputSeq);
    }
  });

  socket.on(CHAT_EVENT_SEND, (payload: RoomChatSendPayload) => {
    const normalizedText = normalizeChatText(payload?.text);
    if (!normalizedText) {
      return;
    }

    const sender = playerManager.getPlayer(socket.id);
    if (!sender) {
      return;
    }

    const scopeId = buildScopeId(sender.worldId, sender.roomId);
    const fallbackEmail = authUser.email ?? `${authUser.authUserId}@users.local`;
    const roomChatMessage: RoomChatMessage = {
      id: createRoomChatMessageId(socket.id),
      roomScopeId: scopeId,
      senderId: socket.id,
      senderName: sender.name || resolvePlayerName(undefined, undefined, fallbackEmail),
      avatarId: sender.avatarId,
      text: normalizedText,
      sentAt: Date.now(),
    };

    io.to(scopeId).emit(CHAT_EVENT_MESSAGE, roomChatMessage);
  });

  socket.on('disconnect', () => {
    const player = playerManager.getPlayer(socket.id);
    const userId = getSocketPersistenceUserId(socket.id);
    const scopeId = playerManager.removePlayer(socket.id);
    console.log(`user disconnected: ${socket.id}`);
    deleteSocketPersistenceUserId(socket.id);
    deleteLastProcessedInputSeq(socket.id);

    if (player && userId) {
      void playerPersistenceService.persistPlayerState({
        socketId: socket.id,
        userId,
        x: player.x,
        y: player.y,
        worldId: player.worldId,
        roomId: player.roomId,
      });
    }

    if (scopeId) {
      io.to(scopeId).emit(playersUpdateEventName, buildPlayersUpdatePayload(scopeId));
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

function getSocketAuthUser(socket: Socket): AuthenticatedSupabaseUser | null {
  const maybeAuthUser = (socket.data as { authUser?: AuthenticatedSupabaseUser }).authUser;
  if (!maybeAuthUser) {
    return null;
  }

  const normalizedAuthUserId = maybeAuthUser.authUserId?.trim();
  if (!normalizedAuthUserId) {
    return null;
  }

  return {
    authUserId: normalizedAuthUserId,
    email: maybeAuthUser.email ?? null,
  };
}
