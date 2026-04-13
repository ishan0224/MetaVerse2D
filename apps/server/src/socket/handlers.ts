import {
  ACTIVITY_CHECK_INTERVAL_MS,
  CHAT_EVENT_MESSAGE,
  CHAT_EVENT_SEND,
  IDLE_TIMEOUT_MS,
  INACTIVITY_ACTIVITY_EVENT,
  INACTIVITY_KICK_REQUEST_EVENT,
  INACTIVITY_PHASE_EVENT,
  type InactivityActivityPayload,
  type InactivityKickRequestPayload,
  type InactivityPhase,
  type InactivityPhasePayload,
  type InputState,
  KICK_TIMEOUT_MS,
  MAX_CHAT_TEXT_LENGTH,
  type NearbyPlayersMap,
  type RoomChatMessage,
  type RoomChatSendPayload,
  WARNING_TIMEOUT_MS,
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
  inputSeq?: number;
  clientSentAtMs?: number;
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
  snapshotSeq: number;
  serverTimeMs: number;
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
    serverTimeMs: number;
    lastProcessedInputSeq?: number;
    inactivityPhase: InactivityPhase;
    lastMovedAt: number;
  }>;
  proximity: NearbyPlayersMap;
};

const PLAYERS_UPDATE_EVENT = 'players:update';
const MOVE_EVENT = 'move';
const JOIN_EVENT = 'join';
const WEBRTC_OFFER_EVENT = 'webrtc:offer';
const WEBRTC_ANSWER_EVENT = 'webrtc:answer';
const WEBRTC_ICE_CANDIDATE_EVENT = 'webrtc:ice-candidate';
const GAME_TICK_RATE_MS = 50;
const INACTIVITY_SYSTEM_SENDER_ID = '__system__';
const playerManager = new PlayerManager();
const proximitySystem = new ProximitySystem();
const playerPersistenceService = new PlayerPersistenceService();
const socketPersistenceUserIds = new Map<string, string>();
const activeSocketIdByAuthUserId = new Map<string, string>();
const scopeSnapshotSeq = new Map<string, number>();
const socketLastProcessedInputSeq = new Map<string, number>();
const socketInactivityState = new Map<string, { lastMovedAt: number; inactivityPhase: InactivityPhase }>();
const inactivityKickPendingSocketIds = new Set<string>();
let lastInactivityEvaluationAtMs = 0;
let gameTickTimer: ReturnType<typeof setInterval> | null = null;

function buildPlayersUpdatePayload(scopeId: string): PlayersUpdatePayload {
  const roomPlayers = playerManager.getPlayersInScope(scopeId);
  const proximity = proximitySystem.updateRoom(scopeId, roomPlayers);
  const serverTimeMs = Date.now();
  const snapshotSeq = getNextSnapshotSeq(scopeId);

  return {
    snapshotSeq,
    serverTimeMs,
    players: roomPlayers.map((player) => {
      const inactivityState = getOrCreateInactivityState(player.id, serverTimeMs);
      return {
      id: player.id,
      x: player.x,
      y: player.y,
      name: player.name,
      worldId: player.worldId,
      color: player.color,
      roomId: player.roomId,
      avatarId: player.avatarId,
      avatarUrl: player.avatarUrl,
      timestamp: serverTimeMs,
      serverTimeMs,
      lastProcessedInputSeq: socketLastProcessedInputSeq.get(player.id),
      inactivityPhase: inactivityState.inactivityPhase,
      lastMovedAt: inactivityState.lastMovedAt,
      };
    }),
    proximity,
  };
}

function removeSocketPresence(io: SocketIOServer, socketId: string): string | null {
  const removedDueToInactivity = inactivityKickPendingSocketIds.has(socketId);
  inactivityKickPendingSocketIds.delete(socketId);
  const player = playerManager.getPlayer(socketId);
  const userId = socketPersistenceUserIds.get(socketId);
  const scopeId = playerManager.removePlayer(socketId);
  socketPersistenceUserIds.delete(socketId);
  socketLastProcessedInputSeq.delete(socketId);
  socketInactivityState.delete(socketId);

  if (player && userId) {
    void playerPersistenceService.persistPlayerState({
      socketId,
      userId,
      x: player.x,
      y: player.y,
      worldId: player.worldId,
      roomId: player.roomId,
    });
  }

  if (scopeId) {
    if (removedDueToInactivity && player) {
      io.to(scopeId).emit(CHAT_EVENT_MESSAGE, createInactivitySystemMessage(scopeId, player.name));
    }
    io.to(scopeId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(scopeId));
  }

  return scopeId;
}

export function registerSocketHandlers(io: SocketIOServer, socket: Socket): void {
  const authUser = getSocketAuthUser(socket);
  if (!authUser) {
    socket.disconnect(true);
    return;
  }

  const existingSocketIdForAuthUser = activeSocketIdByAuthUserId.get(authUser.authUserId);
  if (existingSocketIdForAuthUser && existingSocketIdForAuthUser !== socket.id) {
    removeSocketPresence(io, existingSocketIdForAuthUser);
    io.sockets.sockets.get(existingSocketIdForAuthUser)?.disconnect(true);
  }
  activeSocketIdByAuthUserId.set(authUser.authUserId, socket.id);

  console.log(`user connected: ${socket.id}`);
  getOrCreateInactivityState(socket.id, Date.now());

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

    markSocketActive(socket.id, Date.now());
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

    if (hasMovementIntent(payload.input)) {
      markSocketActive(socket.id, Date.now());
    }

    if (isValidInputSeq(payload.inputSeq)) {
      const previousInputSeq = socketLastProcessedInputSeq.get(socket.id) ?? 0;
      if (payload.inputSeq > previousInputSeq) {
        socketLastProcessedInputSeq.set(socket.id, payload.inputSeq);
      }
    }
  });

  socket.on(INACTIVITY_ACTIVITY_EVENT, (payload: InactivityActivityPayload) => {
    if (!payload || typeof payload.at !== 'number' || !Number.isFinite(payload.at)) {
      return;
    }

    markSocketActive(socket.id, Date.now());
  });

  socket.on(INACTIVITY_PHASE_EVENT, (payload: InactivityPhasePayload) => {
    if (!payload || !isValidInactivityPhase(payload.phase) || !isFiniteTimestamp(payload.lastMovedAt)) {
      return;
    }
    if (payload.phase === 3) {
      return;
    }

    const nowMs = Date.now();
    const inactivityState = getOrCreateInactivityState(socket.id, nowMs);
    inactivityState.lastMovedAt = Math.max(inactivityState.lastMovedAt, Math.min(payload.lastMovedAt, nowMs));
    const maxAllowedPhase = resolveInactivityPhase(nowMs - inactivityState.lastMovedAt);
    if (payload.phase > maxAllowedPhase) {
      return;
    }
    inactivityState.inactivityPhase = payload.phase;
    socketInactivityState.set(socket.id, inactivityState);
  });

  socket.on(INACTIVITY_KICK_REQUEST_EVENT, (payload: InactivityKickRequestPayload) => {
    if (!payload) {
      return;
    }

    if (payload.reason === 'leave') {
      kickSocketForInactivity(io, socket.id);
      return;
    }

    const inactivityState = socketInactivityState.get(socket.id);
    if (!inactivityState) {
      return;
    }

    const elapsedMs = Date.now() - inactivityState.lastMovedAt;
    if (elapsedMs >= KICK_TIMEOUT_MS) {
      kickSocketForInactivity(io, socket.id);
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
      kind: 'USER',
    };

    markSocketActive(socket.id, Date.now());
    io.to(scopeId).emit(CHAT_EVENT_MESSAGE, roomChatMessage);
  });

  socket.on('disconnect', () => {
    removeSocketPresence(io, socket.id);
    console.log(`user disconnected: ${socket.id}`);
    if (activeSocketIdByAuthUserId.get(authUser.authUserId) === socket.id) {
      activeSocketIdByAuthUserId.delete(authUser.authUserId);
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

export function startGameTick(io: SocketIOServer): void {
  if (gameTickTimer) {
    return;
  }

  gameTickTimer = setInterval(() => {
    const activeScopeIds = playerManager.getAllScopeIds();
    pruneScopeMetadata(activeScopeIds);
    evaluateInactivityTransitions(io, Date.now());

    for (const scopeId of activeScopeIds) {
      io.to(scopeId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(scopeId));
    }
  }, GAME_TICK_RATE_MS);
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

function getNextSnapshotSeq(scopeId: string): number {
  const previousSnapshotSeq = scopeSnapshotSeq.get(scopeId) ?? 0;
  const nextSnapshotSeq = previousSnapshotSeq + 1;
  scopeSnapshotSeq.set(scopeId, nextSnapshotSeq);
  return nextSnapshotSeq;
}

function pruneScopeMetadata(activeScopeIds: string[]): void {
  const activeScopeIdSet = new Set(activeScopeIds);
  for (const scopeId of scopeSnapshotSeq.keys()) {
    if (!activeScopeIdSet.has(scopeId)) {
      scopeSnapshotSeq.delete(scopeId);
    }
  }
}

function isValidInputSeq(inputSeq: number | undefined): inputSeq is number {
  return (
    typeof inputSeq === 'number' &&
    Number.isFinite(inputSeq) &&
    Number.isInteger(inputSeq) &&
    inputSeq > 0
  );
}

function getOrCreateInactivityState(
  socketId: string,
  nowMs: number,
): { lastMovedAt: number; inactivityPhase: InactivityPhase } {
  const existingState = socketInactivityState.get(socketId);
  if (existingState) {
    return existingState;
  }

  const nextState = {
    lastMovedAt: nowMs,
    inactivityPhase: 0 as InactivityPhase,
  };
  socketInactivityState.set(socketId, nextState);
  return nextState;
}

function markSocketActive(socketId: string, nowMs: number): void {
  const nextState = getOrCreateInactivityState(socketId, nowMs);
  nextState.lastMovedAt = nowMs;
  nextState.inactivityPhase = 0;
  socketInactivityState.set(socketId, nextState);
}

function evaluateInactivityTransitions(io: SocketIOServer, nowMs: number): void {
  if (nowMs - lastInactivityEvaluationAtMs < ACTIVITY_CHECK_INTERVAL_MS) {
    return;
  }
  lastInactivityEvaluationAtMs = nowMs;

  for (const [socketId, inactivityState] of socketInactivityState.entries()) {
    const player = playerManager.getPlayer(socketId);
    if (!player) {
      socketInactivityState.delete(socketId);
      inactivityKickPendingSocketIds.delete(socketId);
      continue;
    }

    const elapsedMs = nowMs - inactivityState.lastMovedAt;
    if (elapsedMs >= KICK_TIMEOUT_MS) {
      kickSocketForInactivity(io, socketId);
      continue;
    }

    const nextPhase = resolveInactivityPhase(elapsedMs);
    if (nextPhase === inactivityState.inactivityPhase) {
      continue;
    }

    inactivityState.inactivityPhase = nextPhase;
    socketInactivityState.set(socketId, inactivityState);
  }
}

function resolveInactivityPhase(elapsedMs: number): InactivityPhase {
  if (elapsedMs >= WARNING_TIMEOUT_MS) {
    return 2;
  }

  if (elapsedMs >= IDLE_TIMEOUT_MS) {
    return 1;
  }

  return 0;
}

function kickSocketForInactivity(io: SocketIOServer, socketId: string): void {
  if (inactivityKickPendingSocketIds.has(socketId)) {
    return;
  }

  const socket = io.sockets.sockets.get(socketId);
  if (!socket) {
    return;
  }

  inactivityKickPendingSocketIds.add(socketId);
  socket.disconnect(true);
}

function createInactivitySystemMessage(scopeId: string, username: string): RoomChatMessage {
  const normalizedUsername = username.trim() || 'A player';
  return {
    id: createRoomChatMessageId(INACTIVITY_SYSTEM_SENDER_ID),
    roomScopeId: scopeId,
    senderId: INACTIVITY_SYSTEM_SENDER_ID,
    senderName: 'System',
    text: `${normalizedUsername} has been removed from the space due to inactivity.`,
    sentAt: Date.now(),
    kind: 'SYSTEM',
  };
}

function hasMovementIntent(input: InputState): boolean {
  if (input.up || input.down || input.left || input.right) {
    return true;
  }

  return Math.hypot(input.moveX ?? 0, input.moveY ?? 0) > 0.05;
}

function isValidInactivityPhase(value: InactivityPhase | number | undefined): value is InactivityPhase {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isFiniteTimestamp(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
