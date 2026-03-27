import { createServer } from 'node:http';

import express from 'express';

import { attachPersistenceRoutes } from './persistenceRoutes';

export function createHttpServer() {
  const app = express();
  app.use(express.json());
  attachPersistenceRoutes(app);
  const httpServer = createServer(app);

  return { app, httpServer };
}
