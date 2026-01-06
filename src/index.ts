import { PgStore } from './pg/pg-store';
import { JobQueue } from './token-processor/queue/job-queue';
import { buildApiServer, buildPromServer } from './api/init';
import { TokenProcessorMetrics } from './token-processor/token-processor-metrics';
import { ENV } from './env';
import { buildAdminRpcServer } from './admin-rpc/init';
import { isProdEnv } from './api/util/helpers';
import { buildProfilerServer, logger, registerShutdownConfig } from '@hirosystems/api-toolkit';
import { closeChainhookServer, startChainhookServer } from './chainhook/server';

/**
 * Initializes background services. Only for `default` and `writeonly` run modes.
 * @param db - PgStore
 */
async function initBackgroundServices(db: PgStore) {
  logger.info('Initializing background services...');

  const jobQueue = new JobQueue({ db });
  registerShutdownConfig({
    name: 'Job Queue',
    forceKillable: false,
    handler: async () => {
      await jobQueue.stop();
    },
  });
  if (ENV.JOB_QUEUE_AUTO_START) jobQueue.start();

  const server = await startChainhookServer({ db });
  registerShutdownConfig({
    name: 'Chainhook Server',
    forceKillable: false,
    handler: async () => {
      await closeChainhookServer(server);
    },
  });

  const adminRpcServer = await buildAdminRpcServer({ db, jobQueue });
  registerShutdownConfig({
    name: 'Admin RPC Server',
    forceKillable: false,
    handler: async () => {
      await adminRpcServer.close();
    },
  });
  await adminRpcServer.listen({ host: ENV.API_HOST, port: ENV.ADMIN_RPC_PORT });
}

/**
 * Initializes API service. Only for `default` and `readonly` run modes.
 * @param db - PgStore
 */
async function initApiService(db: PgStore) {
  logger.info('Initializing API service...');
  const apiServer = await buildApiServer({ db });
  registerShutdownConfig({
    name: 'API Server',
    forceKillable: false,
    handler: async () => {
      await apiServer.close();
    },
  });

  await apiServer.listen({ host: ENV.API_HOST, port: ENV.API_PORT });

  if (isProdEnv) {
    const promServer = await buildPromServer({ metrics: apiServer.metrics });
    registerShutdownConfig({
      name: 'Prometheus Server',
      forceKillable: false,
      handler: async () => {
        await promServer.close();
      },
    });

    TokenProcessorMetrics.configure(db);
    await promServer.listen({ host: ENV.API_HOST, port: ENV.PROMETHEUS_PORT });
  }
}

async function initApp() {
  logger.info(`Initializing in ${ENV.RUN_MODE} run mode...`);
  const db = await PgStore.connect({ skipMigrations: ENV.RUN_MODE === 'readonly' });

  if (['default', 'writeonly'].includes(ENV.RUN_MODE)) {
    await initBackgroundServices(db);
  }
  if (['default', 'readonly'].includes(ENV.RUN_MODE)) {
    await initApiService(db);
  }

  const profilerServer = await buildProfilerServer();
  registerShutdownConfig({
    name: 'Profiler Server',
    forceKillable: false,
    handler: async () => {
      await profilerServer.close();
    },
  });
  await profilerServer.listen({ host: ENV.API_HOST, port: ENV.PROFILER_PORT });

  registerShutdownConfig({
    name: 'DB',
    forceKillable: false,
    handler: async () => {
      await db.close({ timeout: ENV.PG_CLOSE_TIMEOUT });
    },
  });
}

registerShutdownConfig();
initApp()
  .then(() => {
    logger.info('App initialized');
  })
  .catch(error => {
    logger.error(error, `App failed to start`);
    process.exit(1);
  });
