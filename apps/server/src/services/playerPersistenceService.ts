import { getDbClient } from '../db/client';
import { getPlayerStateByUserId, upsertPlayerState } from '../db/queries/playerState';
import {
  createUser,
  getUserByAuthUserId,
  getUserByUsername,
} from '../db/queries/users';

export type PersistedUser = {
  id: string;
  authUserId: string;
  email: string | null;
  username: string;
  avatarUrl: string | null;
};

export type PersistedPlayerState = {
  userId: string;
  x: number;
  y: number;
  worldId: string;
  roomId: string;
  updatedAt: Date;
};

type UpsertPersistedPlayerStateInput = {
  userId: string;
  x: number;
  y: number;
  worldId: string;
  roomId: string;
  socketId?: string;
};

type ResolveUserFromAuthInput = {
  authUserId: string;
  email: string;
  username?: string;
  avatarUrl?: string;
};

export class PlayerPersistenceService {
  public isEnabled(): boolean {
    return getDbClient() !== null;
  }

  public async getOrCreateUserFromAuth(
    input: ResolveUserFromAuthInput,
  ): Promise<PersistedUser | null> {
    const db = getDbClient();
    if (!db) {
      return null;
    }

    const normalizedAuthUserId = input.authUserId.trim();
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedAuthUserId || !normalizedEmail) {
      return null;
    }
    const normalizedUsername = normalizeUsername(input.username, normalizedEmail);
    const normalizedAvatarUrl = input.avatarUrl?.trim() || undefined;

    try {
      const existingUser = await getUserByAuthUserId(db, normalizedAuthUserId);
      if (existingUser) {
        const resolvedUsername = normalizedUsername || existingUser.username;
        const resolvedAvatarUrl = normalizedAvatarUrl ?? existingUser.avatarUrl ?? undefined;
        const upsertedUser = await createUser(db, {
          authUserId: normalizedAuthUserId,
          email: normalizedEmail,
          username: resolvedUsername,
          avatarUrl: resolvedAvatarUrl,
        });
        if (!upsertedUser) {
          return null;
        }

        return {
          id: upsertedUser.id,
          authUserId: upsertedUser.authUserId,
          email: upsertedUser.email,
          username: upsertedUser.username,
          avatarUrl: upsertedUser.avatarUrl,
        };
      }

      const createdUser = await createUser(db, {
        authUserId: normalizedAuthUserId,
        email: normalizedEmail,
        username: normalizedUsername,
        avatarUrl: normalizedAvatarUrl,
      });
      if (!createdUser) {
        return null;
      }

      return {
        id: createdUser.id,
        authUserId: createdUser.authUserId,
        email: createdUser.email,
        username: createdUser.username,
        avatarUrl: createdUser.avatarUrl,
      };
    } catch (error) {
      console.error('[persistence] failed to resolve auth user', {
        event: 'user_lookup',
        authUserId: normalizedAuthUserId,
        email: normalizedEmail,
        error,
      });
      return null;
    }
  }

  public async getUserByAuthUserId(authUserId: string): Promise<PersistedUser | null> {
    const db = getDbClient();
    if (!db) {
      return null;
    }

    const normalizedAuthUserId = authUserId.trim();
    if (!normalizedAuthUserId) {
      return null;
    }

    try {
      const user = await getUserByAuthUserId(db, normalizedAuthUserId);
      if (!user) {
        return null;
      }

      return {
        id: user.id,
        authUserId: user.authUserId,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
      };
    } catch (error) {
      console.error('[persistence] failed to load auth user', {
        event: 'user_read',
        authUserId: normalizedAuthUserId,
        error,
      });
      return null;
    }
  }

  public async getUserByUsername(username: string): Promise<PersistedUser | null> {
    const db = getDbClient();
    if (!db) {
      return null;
    }

    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      return null;
    }

    try {
      const user = await getUserByUsername(db, normalizedUsername);
      if (!user) {
        return null;
      }

      return {
        id: user.id,
        authUserId: user.authUserId,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
      };
    } catch (error) {
      console.error('[persistence] failed to load user by username', {
        event: 'user_read_by_username',
        username: normalizedUsername,
        error,
      });
      return null;
    }
  }

  public async getPlayerState(userId: string, socketId: string): Promise<PersistedPlayerState | null> {
    const db = getDbClient();
    if (!db) {
      return null;
    }

    try {
      const state = await getPlayerStateByUserId(db, userId);
      if (!state) {
        return null;
      }

      return {
        userId: state.userId,
        x: state.x,
        y: state.y,
        worldId: state.worldId,
        roomId: state.roomId,
        updatedAt: state.updatedAt,
      };
    } catch (error) {
      console.error('[persistence] failed to load player state', {
        event: 'player_state_read',
        socketId,
        userId,
        error,
      });
      return null;
    }
  }

  public async persistPlayerState(input: UpsertPersistedPlayerStateInput): Promise<void> {
    const db = getDbClient();
    if (!db) {
      return;
    }

    try {
      await upsertPlayerState(db, {
        userId: input.userId,
        x: input.x,
        y: input.y,
        worldId: input.worldId,
        roomId: input.roomId,
      });
    } catch (error) {
      console.error('[persistence] failed to persist player state', {
        event: 'player_state_write',
        socketId: input.socketId ?? 'n/a',
        userId: input.userId,
        worldId: input.worldId,
        roomId: input.roomId,
        error,
      });
    }
  }
}

function normalizeUsername(username: string | undefined, email: string): string {
  const trimmed = username?.trim();
  if (trimmed) {
    return trimmed.slice(0, 32);
  }

  const emailPrefix = email.split('@')[0]?.trim();
  if (emailPrefix) {
    return emailPrefix.slice(0, 32);
  }

  return 'player';
}
