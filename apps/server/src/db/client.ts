import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { resolveDatabaseUrl } from './connectionString';
import * as schema from './schema';

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let pool: Pool | null = null;
let dbClient: DbClient | null = null;
let loggedMissingDatabaseUrl = false;
let loggedLibpqCompatibilityAdjustment = false;

export function getDbClient(): DbClient | null {
  const { value: databaseUrl, wasAdjustedForLibpqCompatibility } = resolveDatabaseUrl(
    process.env.SERVER_DATABASE_URL,
  );
  if (!databaseUrl) {
    if (!loggedMissingDatabaseUrl) {
      loggedMissingDatabaseUrl = true;
      console.warn('[db] SERVER_DATABASE_URL is not set; persistence is disabled.');
    }
    return null;
  }

  if (wasAdjustedForLibpqCompatibility && !loggedLibpqCompatibilityAdjustment) {
    loggedLibpqCompatibilityAdjustment = true;
    console.info(
      '[db] Added `uselibpqcompat=true` to SERVER_DATABASE_URL for Supabase pooled TLS compatibility.',
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    dbClient = drizzle(pool, { schema });
  }

  return dbClient;
}

export async function closeDatabaseConnection(): Promise<void> {
  if (!pool) {
    return;
  }

  const activePool = pool;
  pool = null;
  dbClient = null;
  await activePool.end();
}
