/** @module apps/server/src/db/queries/users.ts */

import { and, eq, isNull } from 'drizzle-orm';

import type { DbClient } from '../client';
import type { UserRow } from '../schema';
import { users } from '../schema';

type CreateUserInput = {
  authUserId: string;
  email: string;
  username: string;
  avatarUrl?: string;
};

export async function getUserByUsername(db: DbClient, username: string): Promise<UserRow | null> {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return user ?? null;
}

export async function getUserByAuthUserId(db: DbClient, authUserId: string): Promise<UserRow | null> {
  const [user] = await db.select().from(users).where(eq(users.authUserId, authUserId)).limit(1);
  return user ?? null;
}

export async function getUserByEmail(db: DbClient, email: string): Promise<UserRow | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function createUser(db: DbClient, input: CreateUserInput): Promise<UserRow | null> {
  const [createdUser] = await db
    .insert(users)
    .values({
      id: input.authUserId,
      authUserId: input.authUserId,
      email: input.email,
      username: input.username,
      avatarUrl: input.avatarUrl,
    })
    .onConflictDoUpdate({
      target: users.authUserId,
      set: {
        email: input.email,
        username: input.username,
        avatarUrl: input.avatarUrl,
      },
    })
    .returning();

  if (createdUser) {
    return createdUser;
  }

  return getUserByAuthUserId(db, input.authUserId);
}

export async function setUserAvatarUrlIfMissing(
  db: DbClient,
  userId: string,
  avatarUrl: string,
): Promise<void> {
  await db
    .update(users)
    .set({ avatarUrl })
    .where(and(eq(users.id, userId), isNull(users.avatarUrl)));
}
