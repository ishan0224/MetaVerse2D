import type { Server as HttpServer } from 'node:http';

import { Server as SocketIOServer } from 'socket.io';

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

  io.on('connection', (socket) => {
    registerSocketHandlers(io, socket);
  });

  return io;
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
