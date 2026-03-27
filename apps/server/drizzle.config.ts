import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

import { resolveDatabaseUrl } from './src/db/connectionString.ts';

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  let value = trimmed.slice(separatorIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const configDir = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(configDir, '.env'));
loadEnvFile(resolve(configDir, '../../.env'));

const { value: databaseUrl, wasAdjustedForLibpqCompatibility } = resolveDatabaseUrl(
  process.env.SERVER_DATABASE_URL,
);

if (!databaseUrl) {
  throw new Error(
    'SERVER_DATABASE_URL is required. Add it to apps/server/.env (recommended) or root .env.',
  );
}

if (wasAdjustedForLibpqCompatibility) {
  console.info(
    '[drizzle] Added `uselibpqcompat=true` to SERVER_DATABASE_URL for Supabase pooled TLS compatibility.',
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
