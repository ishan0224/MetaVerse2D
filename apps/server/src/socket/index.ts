import type { Server as HttpServer } from 'node:http';

import { Server as SocketIOServer, type Socket } from 'socket.io';

import { verifySupabaseAccessToken } from '../auth/supabaseAuth';
import { registerSocketHandlers } from './handlers';

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const allowedOrigins = getAllowedOrigins();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || isOriginAllowed(origin, allowedOrigins)) {
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

function getAllowedOrigins(): Set<string> {
  const fromEnv = (process.env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([
    'http://localhost:3000',
    'https://localhost:3000',
    ...fromEnv,
  ]);
}

function isOriginAllowed(origin: string, allowedOrigins: Set<string>): boolean {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  // Quick-tunnel dev domains rotate often; allow them explicitly for this dev server.
  return origin.endsWith('.trycloudflare.com');
}
