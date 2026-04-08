/** @module apps/server/src/index.ts */

import { loadServerEnvironment, resolveServerRuntimeEnv } from './core/loadEnvironment';
import { createHttpServer } from './core/server';
import { closeDatabaseConnection } from './db/client';
import { attachSocketServer } from './socket';

loadServerEnvironment();
const runtimeEnv = resolveServerRuntimeEnv();

const port = runtimeEnv.serverPort;

const { httpServer } = createHttpServer();
const io = attachSocketServer(httpServer);

const serverInstance = httpServer.listen(port, () => {
  console.log(`server listening on ${port}`);
});

let shuttingDown = false;

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

function shutdown(signal: ShutdownSignal): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`received ${signal}, shutting down server...`);

  io.close(() => {
    serverInstance.close((error) => {
      if (error) {
        console.error('error during shutdown', error);
        process.exit(1);
        return;
      }

      void closeDatabaseConnection()
        .catch((dbError) => {
          console.error('error while closing database connection', dbError);
        })
        .finally(() => {
          process.exit(0);
        });
    });
  });
}

process.once('SIGINT', () => {
  shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  shutdown('SIGTERM');
});
