import Fastify, { FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FtRoutes } from './routes/ft.js';
import { NftRoutes } from './routes/nft.js';
import { SftRoutes } from './routes/sft.js';
import { SearchRoutes } from './routes/search.js';
import { PgStore } from '../pg/pg-store.js';
import FastifyCors from '@fastify/cors';
import { StatusRoutes } from './routes/status.js';
import FastifyMetricsModule from 'fastify-metrics';
import type { IFastifyMetrics } from 'fastify-metrics';
const FastifyMetrics = FastifyMetricsModule.default ?? FastifyMetricsModule;
import { Server } from 'http';
import { isProdEnv } from './util/helpers.js';
import { PINO_LOGGER_CONFIG } from '@stacks/api-toolkit';

export const Api: FastifyPluginAsync<Record<never, never>, Server, TypeBoxTypeProvider> = async (
  fastify,
  options
) => {
  await fastify.register(FtRoutes);
  await fastify.register(NftRoutes);
  await fastify.register(SftRoutes);
  await fastify.register(SearchRoutes);
  await fastify.register(StatusRoutes);
};

export async function buildApiServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_LOGGER_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  if (isProdEnv) {
    await fastify.register(FastifyMetrics, { endpoint: null });
  }
  await fastify.register(FastifyCors);
  await fastify.register(Api, { prefix: '/metadata/v1' });
  await fastify.register(Api, { prefix: '/metadata' });

  return fastify;
}

export async function buildPromServer(args: { metrics: IFastifyMetrics }) {
  const promServer = Fastify({
    trustProxy: true,
    logger: PINO_LOGGER_CONFIG,
  });

  promServer.route({
    url: '/metrics',
    method: 'GET',
    logLevel: 'info',
    handler: async (_, reply) => {
      await reply.type('text/plain').send(await args.metrics.client.register.metrics());
    },
  });

  return promServer;
}
