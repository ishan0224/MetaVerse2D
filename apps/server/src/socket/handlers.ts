import {
  CHAT_EVENT_MESSAGE,
  CHAT_EVENT_SEND,
  type InputState,
  MAX_CHAT_TEXT_LENGTH,
  type NearbyPlayersMap,
  type RoomChatMessage,
  type RoomChatSendPayload,
} from '@metaverse2d/shared';
import type { Server as SocketIOServer, Socket } from 'socket.io';

import type { AuthenticatedSupabaseUser } from '../auth/supabaseAuth';
import { PlayerManager } from '../domain/playerManager';
import { ProximitySystem } from '../domain/proximitySystem';
import { getSpawnPositionForRoom } from '../domain/spawnSystem';
import { PlayerPersistenceService } from '../services/playerPersistenceService';

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
  name?: string;
  worldId: string;
  roomId: string;
  avatarId?: number;
  avatarUrl?: string;
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
    worldId: string;
    color: number;
    roomId: string;
    avatarId?: number;
    avatarUrl?: string;
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
const playerPersistenceService = new PlayerPersistenceService();
const socketPersistenceUserIds = new Map<string, string>();

function buildPlayersUpdatePayload(scopeId: string): PlayersUpdatePayload {
  const roomPlayers = playerManager.getPlayersInScope(scopeId);
  const proximity = proximitySystem.updateRoom(scopeId, roomPlayers);

  return {
    players: roomPlayers.map((player) => ({
      id: player.id,
      x: player.x,
      y: player.y,
      name: player.name,
      worldId: player.worldId,
      color: player.color,
      roomId: player.roomId,
      avatarId: player.avatarId,
      avatarUrl: player.avatarUrl,
      timestamp: Date.now(),
    })),
    proximity,
  };
}

export function registerSocketHandlers(io: SocketIOServer, socket: Socket): void {
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
    void handleJoin(payload).catch((error) => {
      console.error('[socket] join handler failed', {
        event: 'join',
        socketId: socket.id,
        error,
      });
    });
  });

  const handleJoin = async (payload: JoinPayload): Promise<void> => {
    const worldId = normalizeWorldId(payload?.worldId);
    const roomId = normalizeRoomId(payload?.roomId);
    const avatarId = normalizeAvatarId(payload?.avatarId);
    const avatarUrl = normalizeAvatarUrl(payload?.avatarUrl);
    const fallbackEmail = authUser.email ?? `${authUser.authUserId}@users.local`;

    const existingUserId = socketPersistenceUserIds.get(socket.id);
    const existingPlayer = playerManager.getPlayer(socket.id);
    if (existingUserId && existingPlayer) {
      void playerPersistenceService.persistPlayerState({
        socketId: socket.id,
        userId: existingUserId,
        x: existingPlayer.x,
        y: existingPlayer.y,
        worldId: existingPlayer.worldId,
        roomId: existingPlayer.roomId,
      });
    }

    const previousScopeId = playerManager.getPlayerScopeId(socket.id);
    if (previousScopeId) {
      playerManager.removePlayer(socket.id);
      socket.leave(previousScopeId);
      io.to(previousScopeId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(previousScopeId));
    }

    const persistedUser = await playerPersistenceService.getOrCreateUserFromAuth({
      authUserId: authUser.authUserId,
      email: fallbackEmail,
      username: payload?.name,
      avatarUrl,
    });
    const playerName = resolvePlayerName(payload?.name, persistedUser?.username, fallbackEmail);
    if (persistedUser) {
      socketPersistenceUserIds.set(socket.id, persistedUser.id);
    } else {
      socketPersistenceUserIds.delete(socket.id);
    }

    const persistedState = persistedUser
      ? await playerPersistenceService.getPlayerState(persistedUser.id, socket.id)
      : null;
    const resolvedWorldId = worldId;
    const resolvedRoomId = roomId;
    const scopeId = buildScopeId(resolvedWorldId, resolvedRoomId);
    const playersInScope = playerManager.getPlayersInScope(scopeId);

    const spawnPosition =
      persistedState &&
      persistedState.worldId === resolvedWorldId &&
      persistedState.roomId === resolvedRoomId
        ? { x: persistedState.x, y: persistedState.y }
        : getSpawnPositionForRoom(resolvedWorldId, playersInScope);

    playerManager.createScope(scopeId);
    playerManager.addPlayer(
      socket.id,
      playerName,
      resolvedWorldId,
      resolvedRoomId,
      spawnPosition.x,
      spawnPosition.y,
      avatarId,
      avatarUrl,
    );

    socket.join(scopeId);
    io.to(scopeId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(scopeId));
  };

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

    const scopeId = buildScopeId(updatedPlayer.worldId, updatedPlayer.roomId);
    io.to(scopeId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(scopeId));
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
    const userId = socketPersistenceUserIds.get(socket.id);
    const scopeId = playerManager.removePlayer(socket.id);
    console.log(`user disconnected: ${socket.id}`);
    socketPersistenceUserIds.delete(socket.id);

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
      io.to(scopeId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(scopeId));
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

function resolvePlayerName(
  requestedName: string | undefined,
  persistedUsername: string | undefined,
  fallbackEmail: string,
): string {
  const trimmedRequested = requestedName?.trim();
  if (trimmedRequested) {
    return trimmedRequested.slice(0, 32);
  }

  const trimmedPersisted = persistedUsername?.trim();
  if (trimmedPersisted) {
    return trimmedPersisted.slice(0, 32);
  }

  const fallbackFromEmail = fallbackEmail.split('@')[0]?.trim();
  if (fallbackFromEmail) {
    return fallbackFromEmail.slice(0, 32);
  }

  return 'player';
}

function normalizeAvatarUrl(avatarUrl: string | undefined): string | undefined {
  const trimmed = avatarUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

function normalizeAvatarId(avatarId: number | undefined): number | undefined {
  if (typeof avatarId !== 'number' || Number.isNaN(avatarId)) {
    return undefined;
  }

  const rounded = Math.round(avatarId);
  return Math.max(1, Math.min(4, rounded));
}

function normalizeWorldId(worldId: string | undefined): string {
  const trimmed = worldId?.trim();
  return trimmed || '1';
}

function normalizeRoomId(roomId: string | undefined): string {
  const trimmed = roomId?.trim();
  return trimmed || '1';
}

function buildScopeId(worldId: string, roomId: string): string {
  return `${worldId}::${roomId}`;
}

function normalizeChatText(text: string | undefined): string {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) {
    return '';
  }

  return trimmed.slice(0, MAX_CHAT_TEXT_LENGTH);
}

function createRoomChatMessageId(socketId: string): string {
  return `${Date.now()}-${socketId}-${Math.random().toString(36).slice(2, 8)}`;
}
