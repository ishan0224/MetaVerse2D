type WebRtcIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const RAW_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() ?? '';
const RAW_SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL?.trim() ?? '';
const RAW_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const RAW_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
const RAW_WEBRTC_STUN_URLS = process.env.NEXT_PUBLIC_WEBRTC_STUN_URLS?.trim() ?? '';
const RAW_WEBRTC_TURN_URLS = process.env.NEXT_PUBLIC_WEBRTC_TURN_URLS?.trim() ?? '';
const RAW_WEBRTC_TURN_USERNAME = process.env.NEXT_PUBLIC_WEBRTC_TURN_USERNAME?.trim() ?? '';
const RAW_WEBRTC_TURN_CREDENTIAL = process.env.NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL?.trim() ?? '';

function assertUrl(name: string, value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`[web env] ${name} must be a valid http(s) URL.`);
  }
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveSocketUrl(): string {
  if (RAW_SOCKET_URL) {
    return assertUrl('NEXT_PUBLIC_SOCKET_URL', RAW_SOCKET_URL);
  }
  if (IS_PRODUCTION) {
    throw new Error('[web env] NEXT_PUBLIC_SOCKET_URL is required in production.');
  }
  return 'http://localhost:4000';
}

function resolveSupabaseUrl(): string {
  if (!RAW_SUPABASE_URL && IS_PRODUCTION) {
    throw new Error('[web env] NEXT_PUBLIC_SUPABASE_URL is required in production.');
  }
  return RAW_SUPABASE_URL ? assertUrl('NEXT_PUBLIC_SUPABASE_URL', RAW_SUPABASE_URL) : '';
}

function resolveSupabaseAnonKey(): string {
  if (!RAW_SUPABASE_ANON_KEY && IS_PRODUCTION) {
    throw new Error('[web env] NEXT_PUBLIC_SUPABASE_ANON_KEY is required in production.');
  }
  return RAW_SUPABASE_ANON_KEY;
}

function resolveWebRtcIceServers(): WebRtcIceServer[] {
  const configuredStunUrls = parseCsv(RAW_WEBRTC_STUN_URLS);
  const stunUrls =
    configuredStunUrls.length > 0 ? configuredStunUrls : ['stun:stun.l.google.com:19302'];

  const turnUrls = parseCsv(RAW_WEBRTC_TURN_URLS);
  const turnUsername = RAW_WEBRTC_TURN_USERNAME;
  const turnCredential = RAW_WEBRTC_TURN_CREDENTIAL;

  const hasTurnUrls = turnUrls.length > 0;
  const hasTurnAuth = Boolean(turnUsername && turnCredential);

  if (hasTurnUrls && !hasTurnAuth) {
    if (IS_PRODUCTION) {
      throw new Error(
        '[web env] TURN is configured via NEXT_PUBLIC_WEBRTC_TURN_URLS but credentials are missing.',
      );
    }
    console.warn(
      '[web env] NEXT_PUBLIC_WEBRTC_TURN_URLS is set without TURN credentials; TURN will be ignored.',
    );
  }

  const servers: WebRtcIceServer[] = [{ urls: stunUrls }];
  if (hasTurnUrls && hasTurnAuth) {
    servers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  } else if (IS_PRODUCTION) {
    console.warn('[web env] TURN is not configured. Voice reliability may degrade on strict NATs.');
  }

  return servers;
}

export const webEnv = {
  appName: RAW_APP_NAME || 'MetaVerse2D',
  socketUrl: resolveSocketUrl(),
  supabaseUrl: resolveSupabaseUrl(),
  supabaseAnonKey: resolveSupabaseAnonKey(),
  webrtcIceServers: resolveWebRtcIceServers(),
} as const;
