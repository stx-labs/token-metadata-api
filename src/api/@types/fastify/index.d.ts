import { PgStore } from '../../../pg/pg-store';
import { JobQueue } from '../../../token-processor/queue/job-queue';

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
