import { createHttpServer } from './core/server';
import { attachSocketServer } from './socket';

const DEFAULT_PORT = 4000;
const port = Number(process.env.SERVER_PORT ?? DEFAULT_PORT);

const { httpServer } = createHttpServer();
attachSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`server listening on ${port}`);
});
