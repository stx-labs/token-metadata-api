import { PgStore } from '../../../pg/pg-store.js';
import { JobQueue } from '../../../token-processor/queue/job-queue.js';

declare module 'fastify' {
  export interface FastifyInstance<
    HttpServer = Server,
    HttpRequest = IncomingMessage,
    HttpResponse = ServerResponse,
    Logger = FastifyLoggerInstance,
    TypeProvider = FastifyTypeProviderDefault,
  > {
    db: PgStore;
    jobQueue?: JobQueue;
  }
}
