import { normalizeEmail, validateEmailAddress, validateUsername } from '@metaverse2d/shared';
import type { Express, Request, Response } from 'express';

import {
  type AuthenticatedSupabaseUser,
  isSupabaseAuthConfigured,
  verifySupabaseAccessToken,
} from '../auth/supabaseAuth';
import { PlayerPersistenceService } from '../services/playerPersistenceService';

const persistenceService = new PlayerPersistenceService();

type CreateUserBody = {
  username?: string;
  avatarUrl?: string;
};

type UpsertPlayerStateBody = {
  x?: number;
  y?: number;
  worldId?: string;
  roomId?: string;
};

export function attachPersistenceRoutes(app: Express): void {
  app.get('/api/users/email-availability', async (request: Request, response: Response) => {
    if (!persistenceService.isEnabled()) {
      response.status(503).json({ error: 'Persistence is disabled' });
      return;
    }

    const emailQueryParam = request.query.email;
    const rawEmail =
      typeof emailQueryParam === 'string'
        ? emailQueryParam
        : Array.isArray(emailQueryParam) && typeof emailQueryParam[0] === 'string'
          ? emailQueryParam[0]
          : '';
    const emailValidation = validateEmailAddress(rawEmail);
    if (!emailValidation.ok) {
      response.status(400).json({ error: emailValidation.message, available: false });
      return;
    }

    const user = await persistenceService.getUserByEmail(emailValidation.value);
    response.status(200).json({ available: !user });
  });

  app.get('/api/users', async (request: Request, response: Response) => {
    if (!persistenceService.isEnabled()) {
      response.status(503).json({ error: 'Persistence is disabled' });
      return;
    }

    const authUser = await authenticateRequest(request, response);
    if (!authUser) {
      return;
    }

    const user = await persistenceService.getUserByAuthUserId(authUser.authUserId);
    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    response.status(200).json({ user });
  });

  app.post('/api/users', async (request: Request, response: Response) => {
    if (!persistenceService.isEnabled()) {
      response.status(503).json({ error: 'Persistence is disabled' });
      return;
    }

    const authUser = await authenticateRequest(request, response);
    if (!authUser) {
      return;
    }

    const requestBody = request.body as CreateUserBody | undefined;
    const requestedUsername = requestBody?.username ?? '';
    let validatedUsername: string | undefined;
    if (requestedUsername) {
      const usernameValidation = validateUsername(requestedUsername);
      if (!usernameValidation.ok) {
        response.status(400).json({ error: usernameValidation.message });
        return;
      }
      validatedUsername = usernameValidation.value;
    }

    const normalizedEmail = normalizeEmail(resolveAuthEmail(authUser));
    const existingUserByEmail = await persistenceService.getUserByEmail(normalizedEmail);
    if (existingUserByEmail && existingUserByEmail.authUserId !== authUser.authUserId) {
      response.status(409).json({
        error: 'Email is already registered.',
        code: 'EMAIL_TAKEN',
      });
      return;
    }

    const avatarUrl = normalizeAvatarUrl(requestBody?.avatarUrl);
    const user = await persistenceService.getOrCreateUserFromAuth({
      authUserId: authUser.authUserId,
      email: normalizedEmail,
      username: validatedUsername,
      avatarUrl,
    });
    if (!user) {
      const postAttemptExistingUserByEmail = await persistenceService.getUserByEmail(normalizedEmail);
      if (postAttemptExistingUserByEmail && postAttemptExistingUserByEmail.authUserId !== authUser.authUserId) {
        response.status(409).json({
          error: 'Email is already registered.',
          code: 'EMAIL_TAKEN',
        });
        return;
      }

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

    const authUser = await authenticateRequest(request, response);
    if (!authUser) {
      return;
    }

    const user = await persistenceService.getUserByAuthUserId(authUser.authUserId);
    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    const state = await persistenceService.getPlayerState(user.id, 'http:get-player-state');
    if (!state) {
      response.status(404).json({ error: 'Player state not found' });
      return;
    }

    response.status(200).json({ state });
  });

  app.post(
    '/api/player-state',
    async (request: Request, response: Response) => {
      if (!persistenceService.isEnabled()) {
        response.status(503).json({ error: 'Persistence is disabled' });
        return;
      }

      const authUser = await authenticateRequest(request, response);
      if (!authUser) {
        return;
      }

      const user = await persistenceService.getUserByAuthUserId(authUser.authUserId);
      if (!user) {
        response.status(404).json({ error: 'User not found' });
        return;
      }

      const requestBody = request.body as UpsertPlayerStateBody | undefined;
      const worldId = requestBody?.worldId?.trim() ?? '';
      const roomId = requestBody?.roomId?.trim() ?? '';
      const x = Number(requestBody?.x);
      const y = Number(requestBody?.y);

      if (!worldId || !roomId || Number.isNaN(x) || Number.isNaN(y)) {
        response.status(400).json({
          error: 'worldId, roomId, x and y are required',
        });
        return;
      }

      await persistenceService.persistPlayerState({
        userId: user.id,
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

async function authenticateRequest(
  request: Request,
  response: Response,
): Promise<AuthenticatedSupabaseUser | null> {
  if (!isSupabaseAuthConfigured()) {
    response.status(503).json({ error: 'Auth is not configured on server' });
    return null;
  }

  const accessToken = extractAccessToken(request);
  if (!accessToken) {
    response.status(401).json({ error: 'Missing Bearer token' });
    return null;
  }

  const authUser = await verifySupabaseAccessToken(accessToken);
  if (!authUser) {
    response.status(401).json({ error: 'Invalid access token' });
    return null;
  }

  return authUser;
}

function extractAccessToken(request: Request): string | null {
  const authorization = request.header('authorization')?.trim();
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  const normalizedToken = token.trim();
  return normalizedToken ? normalizedToken : null;
}

function resolveAuthEmail(authUser: AuthenticatedSupabaseUser): string {
  return authUser.email?.trim().toLowerCase() || `${authUser.authUserId}@users.local`;
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
