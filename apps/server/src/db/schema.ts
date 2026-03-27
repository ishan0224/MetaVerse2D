import {
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: text('username').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    usernameUniqueIndex: uniqueIndex('users_username_unique_idx').on(table.username),
    usernameIndex: index('users_username_idx').on(table.username),
  }),
);

export const playerState = pgTable(
  'player_state',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    x: doublePrecision('x').notNull(),
    y: doublePrecision('y').notNull(),
    worldId: text('world_id').notNull(),
    roomId: text('room_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    updatedAtIndex: index('player_state_updated_at_idx').on(table.updatedAt),
    worldRoomIndex: index('player_state_world_room_idx').on(table.worldId, table.roomId),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PlayerStateRow = typeof playerState.$inferSelect;
export type NewPlayerStateRow = typeof playerState.$inferInsert;
