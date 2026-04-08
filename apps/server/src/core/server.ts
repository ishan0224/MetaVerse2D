/** @module apps/server/src/core/server.ts */

import { createServer } from 'node:http';

import express from 'express';

import { resolveServerRuntimeEnv } from './loadEnvironment';
import { attachPersistenceRoutes } from './persistenceRoutes';

export function createHttpServer() {
  const runtimeEnv = resolveServerRuntimeEnv();
  const app = express();
  app.use((request, response, next) => {
    const requestOrigin = request.headers.origin;
    if (!requestOrigin) {
      next();
      return;
    }

    const normalizedOrigin = normalizeOrigin(requestOrigin);
    const isAllowed =
      normalizedOrigin !== null &&
      (runtimeEnv.allowedSocketOrigins.has(normalizedOrigin) ||
        (runtimeEnv.allowDevTunnelOrigins &&
          normalizedOrigin.endsWith('.trycloudflare.com')));

    if (!isAllowed) {
      if (request.method.toUpperCase() === 'OPTIONS') {
        response.status(403).end();
        return;
      }

      response.status(403).json({ error: `origin ${requestOrigin} is not allowed by http cors` });
      return;
    }

    response.header('Access-Control-Allow-Origin', normalizedOrigin);
    response.header('Vary', 'Origin');
    response.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.header(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Accept',
    );

    if (request.method.toUpperCase() === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    next();
  });
  app.use(express.json());
  attachPersistenceRoutes(app);
  const httpServer = createServer(app);

  return { app, httpServer };
}

function normalizeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}
