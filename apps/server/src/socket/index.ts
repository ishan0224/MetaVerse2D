import type { Server as HttpServer } from 'node:http';

import { Server as SocketIOServer, type Socket } from 'socket.io';

import { verifySupabaseAccessToken } from '../auth/supabaseAuth';
import { resolveServerRuntimeEnv } from '../core/loadEnvironment';
import { registerSocketHandlers, startGameTick } from './handlers';

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const runtimeEnv = resolveServerRuntimeEnv();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || isOriginAllowed(origin, runtimeEnv.allowedSocketOrigins, runtimeEnv.allowDevTunnelOrigins)) {
          callback(null, true);
          return;
        }

        callback(new Error(`origin ${origin} is not allowed by socket cors`));
      },
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    void (async () => {
      const accessToken = extractSocketAccessToken(socket);
      if (!accessToken) {
        next(new Error('missing auth token'));
        return;
      }

      const authUser = await verifySupabaseAccessToken(accessToken);
      if (!authUser) {
        next(new Error('invalid auth token'));
        return;
      }

      socket.data.authUser = authUser;
      next();
    })().catch((error) => {
      next(error as Error);
    });
  });

  io.on('connection', (socket) => {
    registerSocketHandlers(io, socket);
  });

  startGameTick(io);

  return io;
}

function extractSocketAccessToken(socket: Socket): string | null {
  const handshakeAuth = socket.handshake.auth as
    | {
        token?: unknown;
        accessToken?: unknown;
      }
    | undefined;
  const tokenFromHandshake =
    toTrimmedString(handshakeAuth?.token) ?? toTrimmedString(handshakeAuth?.accessToken);
  if (tokenFromHandshake) {
    return tokenFromHandshake;
  }

  const authorizationHeaderRaw = socket.handshake.headers.authorization;
  const authorizationHeader = Array.isArray(authorizationHeaderRaw)
    ? authorizationHeaderRaw[0]
    : authorizationHeaderRaw;
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer') {
    return null;
  }

  return toTrimmedString(token) ?? null;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isOriginAllowed(
  origin: string,
  allowedOrigins: Set<string>,
  allowDevTunnelOrigins: boolean,
): boolean {
  let normalizedOrigin = origin;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  if (allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  return allowDevTunnelOrigins && normalizedOrigin.endsWith('.trycloudflare.com');
}
