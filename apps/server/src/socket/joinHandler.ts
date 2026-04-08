/** @module apps/server/src/socket/joinHandler.ts */

import type { Server as SocketIOServer, Socket } from 'socket.io';

import type { AuthenticatedSupabaseUser } from '../auth/supabaseAuth';
import { normalizeAvatarUrl } from '../domain/avatarUtils';
import { PlayerManager } from '../domain/playerManager';
import { getSpawnPositionForRoom } from '../domain/spawnSystem';
import { PlayerPersistenceService } from '../services/playerPersistenceService';
import {
  buildScopeId,
  normalizeAvatarId,
  normalizeRoomId,
  normalizeWorldId,
  resolvePlayerName,
} from './normalizers';
import type {
  JoinPayload,
  PlayersUpdatePayload,
} from './payloadTypes';
import {
  deleteSocketPersistenceUserId,
  getSocketPersistenceUserId,
  setSocketPersistenceUserId,
} from './sessionState';

type HandleJoinParams = {
  authUser: AuthenticatedSupabaseUser;
  buildPlayersUpdatePayload: (scopeId: string) => PlayersUpdatePayload;
  io: SocketIOServer;
  payload: JoinPayload;
  playerManager: PlayerManager;
  playerPersistenceService: PlayerPersistenceService;
  playersUpdateEventName: string;
  socket: Socket;
};

export async function handleJoin({
  authUser,
  buildPlayersUpdatePayload,
  io,
  payload,
  playerManager,
  playerPersistenceService,
  playersUpdateEventName,
  socket,
}: HandleJoinParams): Promise<void> {
  const worldId = normalizeWorldId(payload?.worldId);
  const roomId = normalizeRoomId(payload?.roomId);
  const avatarId = normalizeAvatarId(payload?.avatarId);
  const avatarUrl = normalizeAvatarUrl(payload?.avatarUrl);
  const fallbackEmail = authUser.email ?? `${authUser.authUserId}@users.local`;

  const existingUserId = getSocketPersistenceUserId(socket.id);
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
    io.to(previousScopeId).emit(playersUpdateEventName, buildPlayersUpdatePayload(previousScopeId));
  }

  const persistedUser = await playerPersistenceService.getOrCreateUserFromAuth({
    authUserId: authUser.authUserId,
    email: fallbackEmail,
    username: payload?.name,
    avatarUrl,
  });
  const playerName = resolvePlayerName(payload?.name, persistedUser?.username, fallbackEmail);
  if (persistedUser) {
    setSocketPersistenceUserId(socket.id, persistedUser.id);
  } else {
    deleteSocketPersistenceUserId(socket.id);
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
  io.to(scopeId).emit(playersUpdateEventName, buildPlayersUpdatePayload(scopeId));
}
