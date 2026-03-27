import type { Express, Request, Response } from 'express';

import { PlayerPersistenceService } from '../services/playerPersistenceService';

const persistenceService = new PlayerPersistenceService();

type CreateUserBody = {
  username?: string;
  avatarUrl?: string;
};

type UpsertPlayerStateBody = {
  userId?: string;
  x?: number;
  y?: number;
  worldId?: string;
  roomId?: string;
};

export function attachPersistenceRoutes(app: Express): void {
  app.get('/api/users', async (request: Request, response: Response) => {
    if (!persistenceService.isEnabled()) {
      response.status(503).json({ error: 'Persistence is disabled' });
      return;
    }

    const username = String(request.query.username ?? '').trim();
    if (!username) {
      response.status(400).json({ error: 'username is required' });
      return;
    }

    const user = await persistenceService.getUserByUsername(username);
    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    response.status(200).json({ user });
  });

  app.post('/api/users', async (request: Request<unknown, unknown, CreateUserBody>, response: Response) => {
    if (!persistenceService.isEnabled()) {
      response.status(503).json({ error: 'Persistence is disabled' });
      return;
    }

    const username = request.body?.username?.trim() ?? '';
    if (!username) {
      response.status(400).json({ error: 'username is required' });
      return;
    }

    const avatarUrl = request.body?.avatarUrl?.trim();
    const user = await persistenceService.getOrCreateUser(username, avatarUrl || undefined);
    if (!user) {
      response.status(500).json({ error: 'Failed to resolve user' });
      return;
    }

    response.status(200).json({ user });
  });

  app.get('/api/player-state', async (request: Request, response: Response) => {
    if (!persistenceService.isEnabled()) {
      response.status(503).json({ error: 'Persistence is disabled' });
      return;
    }

    const userId = String(request.query.userId ?? '').trim();
    if (!userId) {
      response.status(400).json({ error: 'userId is required' });
      return;
    }

    const state = await persistenceService.getPlayerState(userId, 'http:get-player-state');
    if (!state) {
      response.status(404).json({ error: 'Player state not found' });
      return;
    }

    response.status(200).json({ state });
  });

  app.post(
    '/api/player-state',
    async (request: Request<unknown, unknown, UpsertPlayerStateBody>, response: Response) => {
      if (!persistenceService.isEnabled()) {
        response.status(503).json({ error: 'Persistence is disabled' });
        return;
      }

      const userId = request.body?.userId?.trim() ?? '';
      const worldId = request.body?.worldId?.trim() ?? '';
      const roomId = request.body?.roomId?.trim() ?? '';
      const x = Number(request.body?.x);
      const y = Number(request.body?.y);

      if (!userId || !worldId || !roomId || Number.isNaN(x) || Number.isNaN(y)) {
        response.status(400).json({
          error: 'userId, worldId, roomId, x and y are required',
        });
        return;
      }

      await persistenceService.persistPlayerState({
        userId,
        x,
        y,
        worldId,
        roomId,
        socketId: 'http:upsert-player-state',
      });

      response.status(200).json({ ok: true });
    },
  );
}
