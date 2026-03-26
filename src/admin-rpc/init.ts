import Fastify, { FastifyPluginCallback } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PgStore } from '../pg/pg-store.js';
import { Server } from 'http';
import { Type } from '@sinclair/typebox';
import { SmartContractRegEx } from '../api/schemas.js';
import { logger, PINO_LOGGER_CONFIG } from '@stacks/api-toolkit';
import { reprocessTokenImageCache } from '../token-processor/images/image-cache.js';
import { ENV } from '../env.js';
import { JobQueue } from '../token-processor/queue/job-queue.js';
import { createClient } from '@stacks/blockchain-api-client';
import { ClarityAbi } from '@stacks/transactions';
import { getSmartContractSip } from '../token-processor/util/sip-validation.js';

export const AdminApi: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.post(
    '/refresh-token',
    {
      schema: {
        description:
          'Enqueue a token metadata refresh. This ignores any token refresh modes configured by a SIP-019 notification.',
        body: Type.Object({
          contractId: Type.String({ pattern: SmartContractRegEx.source }),
          tokenIds: Type.Optional(Type.Array(Type.Integer())),
        }),
      },
    },
    async (request, reply) => {
      await fastify.db.sqlWriteTransaction(async sql => {
        const contract = await fastify.db.getSmartContract({ principal: request.body.contractId });
        if (!contract) {
          await reply.code(422).send({ error: 'Contract not found' });
          return;
        }
        await sql`
          UPDATE jobs
          SET status = 'pending', updated_at = NOW()
          WHERE token_id IN (
            SELECT id
            FROM tokens
            WHERE smart_contract_id = ${contract.id}
              ${
                request.body.tokenIds
                  ? sql`AND token_number IN ${sql(request.body.tokenIds)}`
                  : sql``
              }
          )
        `;
        logger.info(
          request.body.tokenIds,
          `AdminRPC refreshing tokens for contract: ${contract.principal}`
        );
        await reply.code(200).send();
      });
    }
  );

  fastify.post(
    '/refresh-token-supply',
    {
      schema: {
        description:
          'Enqueue a token supply refresh. This ignores any token refresh modes configured by a SIP-019 notification.',
        body: Type.Object({
          tokenId: Type.Integer(),
        }),
      },
    },
    async (request, reply) => {
      await fastify.db.sqlWriteTransaction(async sql => {
        const token = await fastify.db.getToken({ id: request.body.tokenId });
        if (!token) {
          await reply.code(422).send({ error: 'Token not found' });
          return;
        }
        await sql`
          INSERT INTO jobs (token_supply_id) VALUES (${token.id})
          ON CONFLICT (token_supply_id) WHERE smart_contract_id IS NULL AND token_id IS NULL DO
            UPDATE SET updated_at = NOW(), status = 'pending'
        `;
        logger.info(`AdminRPC refreshing token supply for token: ${token.id}`);
        await reply.code(200).send();
      });
    }
  );

  fastify.post(
    '/retry-failed',
    {
      schema: {
        description: 'Retry all failed and invalid jobs',
      },
    },
    async (request, reply) => {
      await fastify.db.core.retryAllFailedJobs();
      logger.info(`AdminRPC retrying all failed and invalid jobs`);
      await reply.code(200).send();
    }
  );

  fastify.post(
    '/cache-images',
    {
      schema: {
        description:
          'Recalcualtes caches for token images and uploads results to the configured CDN. This operation is idempotent.',
        body: Type.Object({
          contractId: Type.String({ pattern: SmartContractRegEx.source }),
          tokenIds: Type.Optional(Type.Array(Type.Integer())),
        }),
      },
    },
    async (request, reply) => {
      if (!ENV.IMAGE_CACHE_PROCESSOR_ENABLED) {
        await reply.code(422).send({ error: 'Image cache processor is not enabled' });
        return;
      }
      logger.info(
        `AdminRPC reprocessing image cache for ${request.body.contractId}: (${
          request.body.tokenIds ?? 'all'
        })`
      );
      void reprocessTokenImageCache(fastify.db, request.body.contractId, request.body.tokenIds);
      await reply.code(200).send();
    }
  );

  fastify.post(
    '/job-queue/start',
    { schema: { description: 'Starts the job queue' } },
    async (request, reply) => {
      const jobQueue = fastify.jobQueue;
      if (!jobQueue || jobQueue.isRunning()) {
        await reply.code(422).send({ error: 'Job queue is already running' });
        return;
      }
      jobQueue.start();
      return reply.code(200).send();
    }
  );

  fastify.post(
    '/job-queue/stop',
    { schema: { description: 'Stops the job queue' } },
    async (request, reply) => {
      const jobQueue = fastify.jobQueue;
      if (!jobQueue || !jobQueue.isRunning()) {
        await reply.code(422).send({ error: 'Job queue is already stopped' });
        return;
      }
      void jobQueue.stop();
      return reply.code(200).send();
    }
  );

  fastify.post(
    '/import-contract',
    {
      schema: {
        description:
          'Imports a smart contract from the Stacks API and refreshes its token metadata',
        body: Type.Object({
          contractId: Type.String({ pattern: SmartContractRegEx.source }),
        }),
      },
    },
    async (request, reply) => {
      // Look for the contract in the Stacks Blockchain API.
      const api = createClient({ baseUrl: ENV.STACKS_API_BASE_URL });
      const { data: contract } = await api.GET('/extended/v1/contract/{contract_id}', {
        params: { path: { contract_id: request.body.contractId } },
      });
      if (!contract) {
        await reply.code(422).send({ error: 'Contract not found' });
        return;
      }
      if (!contract.abi) {
        await reply.code(422).send({ error: 'Contract does not have an interface' });
        return;
      }

      // Make sure it's a token contract.
      const abi = JSON.parse(contract.abi) as ClarityAbi;
      const sip = getSmartContractSip(abi);
      if (!sip) {
        await reply.code(422).send({ error: 'Not a token contract' });
        return;
      }

      // Get transaction and block data.
      const { data: transaction } = await api.GET('/extended/v1/tx/{tx_id}', {
        params: { path: { tx_id: contract.tx_id } },
      });
      if (!transaction) {
        await reply.code(422).send({ error: 'Contract deploy transaction not found' });
        return;
      }
      const { data: block } = await api.GET('/extended/v2/blocks/{height_or_hash}', {
        params: { path: { height_or_hash: contract.block_height } },
      });
      if (!block) {
        await reply.code(422).send({ error: 'Contract deploy block not found' });
        return;
      }

      // Enqueue contract for processing.
      await fastify.db.sqlWriteTransaction(async sql => {
        await fastify.db.core.enqueueContract(sql, {
          block_height: contract.block_height,
          index_block_hash: block.index_block_hash,
          principal: contract.contract_id,
          sip,
          tx_id: contract.tx_id,
          // We need to convert to `any` first because there's a bug in the Stacks API types
          // library that causes TS to incorrectly think `tx_index` is not available in the
          // transaction response.
          tx_index: (transaction as any).tx_index,
          fungible_token_name: abi.fungible_tokens[0]?.name ?? null,
          non_fungible_token_name: abi.non_fungible_tokens[0]?.name ?? null,
        });
      });
    }
  );

  done();
};

export async function buildAdminRpcServer(args: { db: PgStore; jobQueue: JobQueue }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_LOGGER_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  fastify.decorate('jobQueue', args.jobQueue);
  await fastify.register(AdminApi, { prefix: '/metadata/admin' });

  return fastify;
}
