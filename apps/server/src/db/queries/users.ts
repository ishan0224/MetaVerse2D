import { and, eq, isNull } from 'drizzle-orm';

import type { DbClient } from '../client';
import type { UserRow } from '../schema';
import { users } from '../schema';

type CreateUserInput = {
  username: string;
  avatarUrl?: string;
};

export async function getUserByUsername(db: DbClient, username: string): Promise<UserRow | null> {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return user ?? null;
}

export async function createUser(db: DbClient, input: CreateUserInput): Promise<UserRow | null> {
  const [createdUser] = await db
    .insert(users)
    .values({
      username: input.username,
      avatarUrl: input.avatarUrl,
    })
    .onConflictDoNothing({ target: users.username })
    .returning();

  if (createdUser) {
    return createdUser;
  }

  return getUserByUsername(db, input.username);
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
