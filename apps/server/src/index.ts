import { createHttpServer } from './core/server';
import { attachSocketServer } from './socket';

const DEFAULT_PORT = 4000;
const port = Number(process.env.SERVER_PORT ?? DEFAULT_PORT);

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

      process.exit(0);
    });
  });
}

process.once('SIGINT', () => {
  shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  shutdown('SIGTERM');
});
