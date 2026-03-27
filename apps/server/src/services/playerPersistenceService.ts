import { getDbClient } from '../db/client';
import { getPlayerStateByUserId, upsertPlayerState } from '../db/queries/playerState';
import { createUser, getUserByUsername, setUserAvatarUrlIfMissing } from '../db/queries/users';

export type PersistedUser = {
  id: string;
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

export class PlayerPersistenceService {
  public isEnabled(): boolean {
    return getDbClient() !== null;
  }

  public async getOrCreateUser(username: string, avatarUrl?: string): Promise<PersistedUser | null> {
    const db = getDbClient();
    if (!db) {
      return null;
    }

    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      return null;
    }

    try {
      const existingUser = await getUserByUsername(db, normalizedUsername);
      if (existingUser) {
        if (avatarUrl && !existingUser.avatarUrl) {
          await setUserAvatarUrlIfMissing(db, existingUser.id, avatarUrl);
          return {
            id: existingUser.id,
            username: existingUser.username,
            avatarUrl,
          };
        }

        return {
          id: existingUser.id,
          username: existingUser.username,
          avatarUrl: existingUser.avatarUrl,
        };
      }

      const createdUser = await createUser(db, {
        username: normalizedUsername,
        avatarUrl,
      });
      if (!createdUser) {
        return null;
      }

      return {
        id: createdUser.id,
        username: createdUser.username,
        avatarUrl: createdUser.avatarUrl,
      };
    } catch (error) {
      console.error('[persistence] failed to get/create user', {
        event: 'user_lookup',
        username: normalizedUsername,
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
        username: user.username,
        avatarUrl: user.avatarUrl,
      };
    } catch (error) {
      console.error('[persistence] failed to load user', {
        event: 'user_read',
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
