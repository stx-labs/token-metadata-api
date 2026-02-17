import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ApiStatusResponse } from '../schemas';
import { SERVER_VERSION } from '@stacks/api-toolkit';
import { handleChainTipCache } from '../util/cache';

export const StatusRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.addHook('preHandler', handleChainTipCache);
  fastify.get(
    '/',
    {
      schema: {
        operationId: 'getApiStatus',
        summary: 'API Status',
        description: 'Displays the status of the API',
        tags: ['Status'],
        response: {
          200: ApiStatusResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await fastify.db.sqlTransaction(async sql => {
        let chain_tip = null;
        const chainTipResult = await fastify.db.core.getChainTip(sql);
        if (chainTipResult) {
          chain_tip = {
            block_height: chainTipResult.block_height,
            index_block_hash: chainTipResult.index_block_hash,
          };
        }
        return {
          server_version: `token-metadata-api ${SERVER_VERSION.tag} (${SERVER_VERSION.branch}:${SERVER_VERSION.commit})`,
          status: 'ready',
          chain_tip: chain_tip,
        };
      });
      await reply.send(result);
    }
  );
  done();
};
