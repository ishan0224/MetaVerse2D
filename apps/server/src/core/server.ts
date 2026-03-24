import { createServer } from 'node:http';

import express from 'express';

export function createHttpServer() {
  const app = express();
  const httpServer = createServer(app);

  return { app, httpServer };
}
