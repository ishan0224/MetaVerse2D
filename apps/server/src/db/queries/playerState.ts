import { eq } from 'drizzle-orm';

import type { DbClient } from '../client';
import type { PlayerStateRow } from '../schema';
import { playerState } from '../schema';

type UpsertPlayerStateInput = {
  userId: string;
  x: number;
  y: number;
  worldId: string;
  roomId: string;
};

export async function getPlayerStateByUserId(
  db: DbClient,
  userId: string,
): Promise<PlayerStateRow | null> {
  const [state] = await db.select().from(playerState).where(eq(playerState.userId, userId)).limit(1);
  return state ?? null;
}

export async function upsertPlayerState(
  db: DbClient,
  input: UpsertPlayerStateInput,
): Promise<PlayerStateRow | null> {
  const [savedState] = await db
    .insert(playerState)
    .values({
      userId: input.userId,
      x: input.x,
      y: input.y,
      worldId: input.worldId,
      roomId: input.roomId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: playerState.userId,
      set: {
        x: input.x,
        y: input.y,
        worldId: input.worldId,
        roomId: input.roomId,
        updatedAt: new Date(),
      },
    })
    .returning();

  return savedState ?? null;
}
