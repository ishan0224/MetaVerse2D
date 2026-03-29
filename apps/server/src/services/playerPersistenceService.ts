import { type DbClient,getDbClient } from '../db/client';
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

const USERNAME_MAX_LENGTH = 32;
const USERNAME_FALLBACK_MAX_ATTEMPTS = 12;

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
    const requestedUsername = normalizeRequestedUsername(input.username);
    const normalizedAvatarUrl = input.avatarUrl?.trim() || undefined;

    try {
      const existingUser = await getUserByAuthUserId(db, normalizedAuthUserId);
      const preferredUsername = existingUser
        ? requestedUsername ?? existingUser.username
        : requestedUsername ?? deriveDefaultUsername(normalizedEmail);
      const resolvedUsername = await resolveAvailableUsername(
        db,
        normalizedAuthUserId,
        preferredUsername,
        existingUser?.username,
      );

      if (existingUser) {
        const resolvedAvatarUrl = normalizedAvatarUrl ?? existingUser.avatarUrl ?? undefined;
        const upsertedUser = await createUserWithUsernameFallback(db, {
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

      const createdUser = await createUserWithUsernameFallback(db, {
        authUserId: normalizedAuthUserId,
        email: normalizedEmail,
        username: resolvedUsername,
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

function normalizeRequestedUsername(username: string | undefined): string | undefined {
  const trimmed = username?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, USERNAME_MAX_LENGTH);
}

function deriveDefaultUsername(email: string): string {
  const emailPrefix = email.split('@')[0]?.trim();
  if (emailPrefix) {
    return emailPrefix.slice(0, USERNAME_MAX_LENGTH);
  }

  return 'player';
}

async function resolveAvailableUsername(
  db: DbClient,
  authUserId: string,
  preferredUsername: string,
  existingUsername: string | undefined,
): Promise<string> {
  const normalizedPreferred = normalizeUsername(preferredUsername);
  const preferredOwner = await getUserByUsername(db, normalizedPreferred);
  if (!preferredOwner || preferredOwner.authUserId === authUserId) {
    return normalizedPreferred;
  }

  const normalizedExisting = existingUsername ? normalizeUsername(existingUsername) : null;
  if (normalizedExisting) {
    const existingOwner = await getUserByUsername(db, normalizedExisting);
    if (!existingOwner || existingOwner.authUserId === authUserId) {
      return normalizedExisting;
    }
  }

  for (let attempt = 1; attempt <= USERNAME_FALLBACK_MAX_ATTEMPTS; attempt += 1) {
    const candidate = buildUniqueUsername(normalizedPreferred, authUserId, attempt);
    const owner = await getUserByUsername(db, candidate);
    if (!owner || owner.authUserId === authUserId) {
      return candidate;
    }
  }

  return buildUniqueUsername(normalizedPreferred, authUserId, Date.now());
}

async function createUserWithUsernameFallback(
  db: DbClient,
  input: {
    authUserId: string;
    email: string;
    username: string;
    avatarUrl?: string;
  },
): Promise<Awaited<ReturnType<typeof createUser>>> {
  let candidateUsername = normalizeUsername(input.username);
  for (let attempt = 1; attempt <= USERNAME_FALLBACK_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await createUser(db, {
        ...input,
        username: candidateUsername,
      });
    } catch (error) {
      if (!isUsernameUniqueViolation(error)) {
        throw error;
      }

      candidateUsername = buildUniqueUsername(input.username, input.authUserId, attempt);
    }
  }

  return createUser(db, {
    ...input,
    username: buildUniqueUsername(input.username, input.authUserId, Date.now()),
  });
}

function normalizeUsername(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) {
    return 'player';
  }

  return trimmed.slice(0, USERNAME_MAX_LENGTH);
}

function buildUniqueUsername(baseUsername: string, authUserId: string, attemptSeed: number): string {
  const normalizedBase = normalizeUsername(baseUsername);
  const authToken =
    authUserId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 6) || 'user';
  const attemptSuffix = attemptSeed > 1 ? String(attemptSeed).slice(-2) : '';
  const suffix = `_${authToken}${attemptSuffix}`;
  const baseMaxLength = Math.max(1, USERNAME_MAX_LENGTH - suffix.length);
  return `${normalizedBase.slice(0, baseMaxLength)}${suffix}`;
}

function isUsernameUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if (matchesUsernameUniqueViolation(error)) {
    return true;
  }

  const maybeCause = (error as { cause?: unknown }).cause;
  return matchesUsernameUniqueViolation(maybeCause);
}

function matchesUsernameUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybePgError = error as {
    code?: string;
    constraint?: string;
    message?: string;
  };

  if (maybePgError.code !== '23505') {
    return false;
  }

  if (maybePgError.constraint === 'users_username_unique_idx') {
    return true;
  }

  const normalizedMessage = maybePgError.message?.toLowerCase() ?? '';
  return normalizedMessage.includes('users_username_unique_idx');
}
