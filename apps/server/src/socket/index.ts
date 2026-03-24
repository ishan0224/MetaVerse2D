import type { Server as HttpServer } from 'node:http';

import { Server as SocketIOServer } from 'socket.io';

import { registerSocketHandlers } from './handlers';

export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    registerSocketHandlers(io, socket);
  });

  return io;
}
