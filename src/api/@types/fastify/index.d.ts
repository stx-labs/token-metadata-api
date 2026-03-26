import { PgStore } from '../../../pg/pg-store.js';
import { JobQueue } from '../../../token-processor/queue/job-queue.js';

declare module 'fastify' {
  export interface FastifyInstance<
    _HttpServer = Server,
    _HttpRequest = IncomingMessage,
    _HttpResponse = ServerResponse,
    _Logger = FastifyLoggerInstance,
    _TypeProvider = FastifyTypeProviderDefault,
  > {
    db: PgStore;
    jobQueue?: JobQueue;
  }
}
