/** @module apps/server/src/scripts/dbCheck.ts */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

import { loadServerEnvironment } from '../core/loadEnvironment';
import { resolveDatabaseUrl } from '../db/connectionString';

type Status = 'ok' | 'warn' | 'fail';

interface CheckResult {
  status: Status;
  label: string;
  details?: string;
}

function logResult(result: CheckResult): void {
  const prefix =
    result.status === 'ok' ? '[ok] ' : result.status === 'warn' ? '[warn] ' : '[fail] ';
  console.log(`${prefix}${result.label}`);
  if (result.details) {
    console.log(`       ${result.details}`);
  }
}

function checkMigrationMetadata(serverDir: string): CheckResult[] {
  const results: CheckResult[] = [];
  const journalPath = resolve(serverDir, 'drizzle/meta/_journal.json');

  if (!existsSync(journalPath)) {
    results.push({
      status: 'fail',
      label: 'Drizzle journal is missing.',
      details: 'Run `npm run db:generate --workspace @metaverse2d/server` once.',
    });
    return results;
  }

  let parsedJournal: { entries?: Array<{ tag?: string }> } | null = null;
  try {
    parsedJournal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries?: Array<{ tag?: string }>;
    };
  } catch {
    results.push({
      status: 'fail',
      label: 'Drizzle journal is not valid JSON.',
      details: `File: ${journalPath}`,
    });
    return results;
  }

  const entries = parsedJournal.entries ?? [];
  if (entries.length === 0) {
    results.push({
      status: 'warn',
      label: 'Drizzle journal has no entries.',
      details: 'No migrations are currently tracked in drizzle/meta/_journal.json.',
    });
    return results;
  }

  results.push({
    status: 'ok',
    label: `Drizzle journal loaded with ${entries.length} tracked migration(s).`,
  });

  for (const entry of entries) {
    if (!entry.tag) {
      results.push({
        status: 'fail',
        label: 'Found journal entry without tag.',
      });
      continue;
    }

    const sqlPath = resolve(serverDir, 'drizzle', `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) {
      results.push({
        status: 'fail',
        label: `Missing migration SQL file for tag "${entry.tag}".`,
        details: `Expected file: ${sqlPath}`,
      });
    }
  }

  return results;
}

async function run(): Promise<number> {
  loadServerEnvironment();

  const serverDir = process.cwd();
  const results: CheckResult[] = [];

  const { value: databaseUrl, wasAdjustedForLibpqCompatibility } = resolveDatabaseUrl(
    process.env.SERVER_DATABASE_URL,
  );

  if (!databaseUrl) {
    results.push({
      status: 'fail',
      label: 'SERVER_DATABASE_URL is not set.',
      details: 'Set it in apps/server/.env or root .env before running DB commands.',
    });
    for (const result of [...results, ...checkMigrationMetadata(serverDir)]) {
      logResult(result);
    }
    return 1;
  }

  if (wasAdjustedForLibpqCompatibility) {
    results.push({
      status: 'warn',
      label: 'Added `uselibpqcompat=true` for Supabase pooled TLS compatibility.',
      details: 'Persist this in SERVER_DATABASE_URL to avoid TLS surprises in other tools.',
    });
  }

  try {
    const parsed = new URL(databaseUrl);
    results.push({
      status: 'ok',
      label: `Database host resolved from URL: ${parsed.hostname}`,
    });
  } catch {
    results.push({
      status: 'fail',
      label: 'SERVER_DATABASE_URL is not a valid URL.',
    });
    for (const result of [...results, ...checkMigrationMetadata(serverDir)]) {
      logResult(result);
    }
    return 1;
  }

  const metadataResults = checkMigrationMetadata(serverDir);
  results.push(...metadataResults);

  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
    const identity = await client.query<{ db: string; usr: string }>(
      'select current_database() as db, current_user as usr',
    );
    const row = identity.rows[0];
    results.push({
      status: 'ok',
      label: `Connected to database "${row.db}" as "${row.usr}".`,
    });

    const extensionCheck = await client.query<{ is_available: boolean; is_installed: boolean }>(
      `select
        exists(select 1 from pg_available_extensions where name = 'pgcrypto') as is_available,
        exists(select 1 from pg_extension where extname = 'pgcrypto') as is_installed`,
    );
    const extensionRow = extensionCheck.rows[0];
    if (!extensionRow.is_available) {
      results.push({
        status: 'fail',
        label: 'pgcrypto extension is not available on this database.',
      });
    } else if (!extensionRow.is_installed) {
      results.push({
        status: 'warn',
        label: 'pgcrypto is available but not installed yet.',
        details: 'First migration run should install it via `CREATE EXTENSION IF NOT EXISTS`.',
      });
    } else {
      results.push({
        status: 'ok',
        label: 'pgcrypto extension is installed.',
      });
    }

    await client.query('create schema if not exists drizzle');
    await client.query(
      'create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)',
    );
    results.push({
      status: 'ok',
      label: 'Can create/use Drizzle migration schema and table.',
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    results.push({
      status: 'fail',
      label: 'Database connectivity or permission check failed.',
      details,
    });
  } finally {
    try {
      await client.end();
    } catch {
      // ignore close errors
    }
  }

  for (const result of results) {
    logResult(result);
  }

  const hasFailure = results.some((result) => result.status === 'fail');
  if (hasFailure) {
    console.log('');
    console.log('db:check failed. Fix the issues above, then run migrate again.');
    return 1;
  }

  console.log('');
  console.log('db:check passed. Safe to run `npm run db:migrate --workspace @metaverse2d/server`.');
  return 0;
}

run()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    const details = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(details);
    process.exit(1);
  });
