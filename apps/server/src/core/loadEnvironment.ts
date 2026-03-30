import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let hasLoadedEnvironment = false;

export type ServerRuntimeEnv = {
  nodeEnv: string;
  isProduction: boolean;
  serverPort: number;
  allowedSocketOrigins: Set<string>;
  allowDevTunnelOrigins: boolean;
};

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
  const lines = contents.split(/\r?\n/);

  for (const line of lines) {
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

export function loadServerEnvironment(): void {
  if (hasLoadedEnvironment) {
    return;
  }

  const currentDir = process.cwd();
  const envCandidates = [resolve(currentDir, '.env'), resolve(currentDir, '../../.env')];

  for (const filePath of envCandidates) {
    loadEnvFile(filePath);
  }

  hasLoadedEnvironment = true;
}

function parseOriginsCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin: string): string {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
    return parsed.origin;
  } catch {
    throw new Error(`[server env] Invalid CLIENT_ORIGIN entry: "${origin}"`);
  }
}

function parseBoolean(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function resolveServerRuntimeEnv(): ServerRuntimeEnv {
  const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
  const isProduction = nodeEnv === 'production';

  const rawServerPort = process.env.SERVER_PORT?.trim() || '4000';
  const serverPort = Number(rawServerPort);
  if (!Number.isInteger(serverPort) || serverPort <= 0 || serverPort > 65535) {
    throw new Error(`[server env] SERVER_PORT must be a valid TCP port. Received "${rawServerPort}".`);
  }

  const primaryOrigins = parseOriginsCsv(process.env.CLIENT_ORIGIN);
  const previewOrigins = parseOriginsCsv(process.env.CLIENT_ORIGIN_PREVIEW);
  const allowedSocketOrigins = new Set(
    [...primaryOrigins, ...previewOrigins].map((origin) => normalizeOrigin(origin)),
  );

  if (!isProduction) {
    allowedSocketOrigins.add('http://localhost:3000');
    allowedSocketOrigins.add('https://localhost:3000');
  }

  if (isProduction && allowedSocketOrigins.size === 0) {
    throw new Error(
      '[server env] CLIENT_ORIGIN must include at least one origin in production.',
    );
  }

  const supabaseUrl = process.env.SERVER_SUPABASE_URL?.trim() ?? '';
  const supabaseAnonKey = process.env.SERVER_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '[server env] SERVER_SUPABASE_URL and SERVER_SUPABASE_ANON_KEY are required for authenticated sockets.',
    );
  }

  const allowDevTunnelOrigins =
    !isProduction && parseBoolean(process.env.ALLOW_DEV_TUNNEL_ORIGINS);

  return {
    nodeEnv,
    isProduction,
    serverPort,
    allowedSocketOrigins,
    allowDevTunnelOrigins,
  };
}
