import type { InputState } from '@metaverse2d/shared';
import type { Server as SocketIOServer, Socket } from 'socket.io';

import { PlayerManager } from '../domain/playerManager';

type MovePayload = {
  playerId: string;
  input: InputState;
  delta: number;
};

type JoinPayload = {
  name: string;
};

type PlayersUpdatePayload = {
  players: Array<{
    id: string;
    x: number;
    y: number;
    name: string;
    color: number;
  }>;
};

const PLAYERS_UPDATE_EVENT = 'players:update';
const MOVE_EVENT = 'move';
const JOIN_EVENT = 'join';
const playerManager = new PlayerManager();

function buildPlayersUpdatePayload(): PlayersUpdatePayload {
  return {
    players: playerManager.getAllPlayers().map((player) => ({
      id: player.id,
      x: player.x,
      y: player.y,
      name: player.name,
      color: player.color,
    })),
  };
}

export function registerSocketHandlers(io: SocketIOServer, socket: Socket): void {
  console.log(`user connected: ${socket.id}`);
  socket.emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload());

  socket.on(JOIN_EVENT, (payload: JoinPayload) => {
    const playerName = payload?.name?.trim();
    if (!playerName) {
      return;
    }

    playerManager.addPlayer(socket.id, playerName);
    io.emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload());
  });

  socket.on(MOVE_EVENT, (payload: MovePayload) => {
    if (!payload || !payload.input || typeof payload.delta !== 'number') {
      return;
    }

    if (payload.playerId !== socket.id) {
      return;
    }

    playerManager.updatePlayer(socket.id, payload.input, payload.delta);
    io.emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload());
  });

  socket.on('disconnect', () => {
    playerManager.removePlayer(socket.id);
    console.log(`user disconnected: ${socket.id}`);
    io.emit(PLAYERS_UPDATE_EVENT, buildPlayersUpdatePayload());
  });
}
