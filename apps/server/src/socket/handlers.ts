/** @module apps/server/src/socket/handlers.ts */

import {
  type Server as SocketIOServer,
  type Socket,
} from 'socket.io';

import { PlayerManager } from '../domain/playerManager';
import { ProximitySystem } from '../domain/proximitySystem';
import { PlayerPersistenceService } from '../services/playerPersistenceService';
import { registerConnectionHandlers } from './connectionHandlers';
import type { PlayersUpdatePayload } from './payloadTypes';
import {
  getLastProcessedInputSeq,
  getNextScopeSnapshotSeq,
  pruneScopeMetadata,
} from './sessionState';

const PLAYERS_UPDATE_EVENT = 'players:update';
const GAME_TICK_RATE_MS = 50;

const playerManager = new PlayerManager();
const proximitySystem = new ProximitySystem();
const playerPersistenceService = new PlayerPersistenceService();
let gameTickTimer: ReturnType<typeof setInterval> | null = null;

function buildPlayersUpdatePayload(scopeId: string): PlayersUpdatePayload {
  const roomPlayers = playerManager.getPlayersInScope(scopeId);
  const proximity = proximitySystem.updateRoom(scopeId, roomPlayers);
  const serverTimeMs = Date.now();
  const snapshotSeq = getNextScopeSnapshotSeq(scopeId);

  return {
    snapshotSeq,
    serverTimeMs,
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
      timestamp: serverTimeMs,
      serverTimeMs,
      lastProcessedInputSeq: getLastProcessedInputSeq(player.id),
    })),
    proximity,
  };
}

export function registerSocketHandlers(io: SocketIOServer, socket: Socket): void {
  registerConnectionHandlers({
    io,
    socket,
    playerManager,
    playerPersistenceService,
    buildPlayersUpdatePayload,
    playersUpdateEventName: PLAYERS_UPDATE_EVENT,
  });
}

export function startGameTick(io: SocketIOServer): void {
  if (gameTickTimer) {
    return;
  }

  gameTickTimer = setInterval(() => {
    const activeScopeIds = playerManager.getAllScopeIds();
    pruneScopeMetadata(activeScopeIds);

    for (const scopeId of activeScopeIds) {
      io.to(scopeId).emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload(scopeId));
    }
  }, GAME_TICK_RATE_MS);
}
