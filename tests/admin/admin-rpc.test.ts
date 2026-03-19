import { strict as assert } from 'node:assert';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import * as imageCache from '../../src/token-processor/images/image-cache';
import { cycleMigrations } from '@stacks/api-toolkit';
import { buildAdminRpcServer } from '../../src/admin-rpc/init';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbJobStatus, DbSipNumber } from '../../src/pg/types';
import {
  insertAndEnqueueTestContractWithTokens,
  markAllJobsAsDone,
  SIP_010_ABI,
  TestFastifyServer,
} from '../helpers';
import { JobQueue } from '../../src/token-processor/queue/job-queue';
import * as nock from 'nock';

describe('Admin RPC', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;
  let jobQueue: JobQueue;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    jobQueue = new JobQueue({ db, network: 'mainnet' });
    fastify = await buildAdminRpcServer({ db, jobQueue });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  describe('/refresh-token', () => {
    test('refreshes single token', async () => {
      const inputJobs = await insertAndEnqueueTestContractWithTokens(
        db,
        'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        DbSipNumber.sip009,
        1n
      );
      await markAllJobsAsDone(db);

      const response = await fastify.inject({
        url: '/metadata/admin/refresh-token',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
          tokenIds: [1],
        }),
        headers: { 'content-type': 'application/json' },
      });
      assert.strictEqual(response.statusCode, 200);

      const jobs = await db.getPendingJobBatch({ limit: 2 });
      assert.strictEqual(jobs.length, 1);
      assert.strictEqual(jobs[0].token_id, inputJobs[0].token_id);
    });

    test('refreshes all tokens', async () => {
      const inputJobs = await insertAndEnqueueTestContractWithTokens(
        db,
        'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        DbSipNumber.sip009,
        2n
      );
      await markAllJobsAsDone(db);

      const response = await fastify.inject({
        url: '/metadata/admin/refresh-token',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        }),
        headers: { 'content-type': 'application/json' },
      });
      assert.strictEqual(response.statusCode, 200);

      const jobs = await db.getPendingJobBatch({ limit: 2 });
      assert.strictEqual(jobs.length, 2);
      assert.strictEqual(jobs[0].token_id, inputJobs[0].token_id);
      assert.strictEqual(jobs[1].token_id, inputJobs[1].token_id);
    });

    test('fails on non-existing contract', async () => {
      const response = await fastify.inject({
        url: '/metadata/admin/refresh-token',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        }),
        headers: { 'content-type': 'application/json' },
      });
      assert.strictEqual(response.statusCode, 422);
      assert.match(JSON.parse(response.body).error, /Contract not found/);
    });
  });

  describe('/refresh-token-supply', () => {
    test('refreshes single token supply', async () => {
      await insertAndEnqueueTestContractWithTokens(
        db,
        'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        DbSipNumber.sip009,
        1n
      );
      await markAllJobsAsDone(db);

      const response = await fastify.inject({
        url: '/metadata/admin/refresh-token-supply',
        method: 'POST',
        payload: JSON.stringify({ tokenId: 1 }),
        headers: { 'content-type': 'application/json' },
      });
      assert.strictEqual(response.statusCode, 200);

      const jobs = await db.getPendingJobBatch({ limit: 2 });
      assert.strictEqual(jobs.length, 1);
      assert.strictEqual(jobs[0].token_supply_id, 1);
    });

    test('fails on non-existing token', async () => {
      const response = await fastify.inject({
        url: '/metadata/admin/refresh-token-supply',
        method: 'POST',
        payload: JSON.stringify({ tokenId: 1 }),
        headers: { 'content-type': 'application/json' },
      });
      assert.strictEqual(response.statusCode, 422);
      assert.match(JSON.parse(response.body).error, /Token not found/);
    });
  });

  describe('/retry-failed', () => {
    test('retries failed and invalid jobs', async () => {
      await insertAndEnqueueTestContractWithTokens(
        db,
        'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        DbSipNumber.sip009,
        1n
      );
      // Simulate failed jobs
      await db.sql`UPDATE jobs SET status = ${DbJobStatus.failed} WHERE id = 1`;
      await db.sql`UPDATE jobs SET status = ${DbJobStatus.invalid} WHERE id = 2`;

      const response = await fastify.inject({
        url: '/metadata/admin/retry-failed',
        method: 'POST',
        payload: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      });
      assert.strictEqual(response.statusCode, 200);

      const jobs = await db.getPendingJobBatch({ limit: 2 });
      assert.strictEqual(jobs.length, 2);
    });
  });

  describe('/cache-images', () => {
    test('reprocesses token images', async () => {
      const spy = mock.method(imageCache, 'reprocessTokenImageCache', () => Promise.resolve());

      ENV.IMAGE_CACHE_PROCESSOR_ENABLED = true;
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await insertAndEnqueueTestContractWithTokens(db, principal, DbSipNumber.sip009, 1n);
      await db.core.updateProcessedTokenWithMetadata({
        id: 1,
        values: {
          token: {
            name: 'hello-world',
            symbol: 'HELLO',
            decimals: 6,
            total_supply: '1',
            uri: 'http://test.com/uri.json',
          },
          metadataLocales: [
            {
              metadata: {
                sip: 16,
                token_id: 1,
                name: 'hello-world',
                l10n_locale: 'en',
                l10n_uri: null,
                l10n_default: true,
                description: 'test',
                image: 'http://test.com/image.png',
                cached_image: null,
                cached_thumbnail_image: null,
              },
            },
          ],
        },
      });
      const response = await fastify.inject({
        url: '/metadata/admin/cache-images',
        method: 'POST',
        payload: JSON.stringify({
          contractId: principal,
        }),
        headers: { 'content-type': 'application/json' },
      });
      assert.strictEqual(response.statusCode, 200);

      assert.strictEqual(spy.mock.callCount(), 1);
      spy.mock.restore();
    });

    test('rejects when image cache is disabled', async () => {
      ENV.IMAGE_CACHE_PROCESSOR_ENABLED = false;
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await insertAndEnqueueTestContractWithTokens(db, principal, DbSipNumber.sip009, 1n);
      await db.core.updateProcessedTokenWithMetadata({
        id: 1,
        values: {
          token: {
            name: 'hello-world',
            symbol: 'HELLO',
            decimals: 6,
            total_supply: '1',
            uri: 'http://test.com/uri.json',
          },
          metadataLocales: [
            {
              metadata: {
                sip: 16,
                token_id: 1,
                name: 'hello-world',
                l10n_locale: 'en',
                l10n_uri: null,
                l10n_default: true,
                description: 'test',
                image: 'http://test.com/image.png',
                cached_image: null,
                cached_thumbnail_image: null,
              },
            },
          ],
        },
      });
      const response = await fastify.inject({
        url: '/metadata/admin/cache-images',
        method: 'POST',
        payload: JSON.stringify({
          contractId: principal,
        }),
        headers: { 'content-type': 'application/json' },
      });
      assert.strictEqual(response.statusCode, 422);
    });
  });

  describe('/import-contract', () => {
    before(() => {
      nock.disableNetConnect();
    });

    beforeEach(() => {
      nock.cleanAll();
    });

    after(() => {
      nock.cleanAll();
      nock.enableNetConnect();
    });

    test('fails if contract not found', async () => {
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT });

      nock('https://api.mainnet.hiro.so')
        .get(`/extended/v1/contract/${principal}`)
        .reply(404, { error: 'Not found' }, { 'content-type': 'application/json' });
      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: principal,
        }),
        headers: { 'content-type': 'application/json' },
      });

      assert.strictEqual(response.statusCode, 422);
      assert.strictEqual(response.json().error, 'Contract not found');
    });

    test('fails if contract is not a token contract', async () => {
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT });

      nock('https://api.mainnet.hiro.so').get(`/extended/v1/contract/${principal}`).reply(
        200,
        {
          tx_id: '0x0101',
          canonical: true,
          contract_id: principal,
          block_height: 5,
          clarity_version: 2,
          source_code: 'test',
          abi: '{}',
        },
        { 'content-type': 'application/json' }
      );
      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: principal,
        }),
        headers: { 'content-type': 'application/json' },
      });

      assert.strictEqual(response.statusCode, 422);
      assert.strictEqual(response.json().error, 'Not a token contract');
    });

    test('fails if contract does not have abi', async () => {
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT });

      nock('https://api.mainnet.hiro.so').get(`/extended/v1/contract/${principal}`).reply(
        200,
        {
          tx_id: '0x0101',
          canonical: true,
          contract_id: principal,
          block_height: 5,
          clarity_version: 2,
          source_code: 'test',
          abi: null,
        },
        { 'content-type': 'application/json' }
      );
      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: principal,
        }),
        headers: { 'content-type': 'application/json' },
      });

      assert.strictEqual(response.statusCode, 422);
      assert.strictEqual(response.json().error, 'Contract does not have an interface');
    });

    test('fails if transaction is not found', async () => {
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT });

      nock('https://api.mainnet.hiro.so')
        .get(`/extended/v1/contract/${principal}`)
        .reply(
          200,
          {
            tx_id: '0x0101',
            canonical: true,
            contract_id: principal,
            block_height: 5,
            clarity_version: 2,
            source_code: 'test',
            abi: JSON.stringify(SIP_010_ABI),
          },
          { 'content-type': 'application/json' }
        );
      nock('https://api.mainnet.hiro.so').get(`/extended/v1/tx/0x0101`).reply(
        404,
        {
          error: 'Not found',
        },
        { 'content-type': 'application/json' }
      );
      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: principal,
        }),
        headers: { 'content-type': 'application/json' },
      });

      assert.strictEqual(response.statusCode, 422);
      assert.strictEqual(response.json().error, 'Contract deploy transaction not found');
    });

    test('fails if block is not found', async () => {
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT });

      nock('https://api.mainnet.hiro.so')
        .get(`/extended/v1/contract/${principal}`)
        .reply(
          200,
          {
            tx_id: '0x0101',
            canonical: true,
            contract_id: principal,
            block_height: 5,
            clarity_version: 2,
            source_code: 'test',
            abi: JSON.stringify(SIP_010_ABI),
          },
          { 'content-type': 'application/json' }
        );
      nock('https://api.mainnet.hiro.so').get(`/extended/v1/tx/0x0101`).reply(
        200,
        {
          tx_index: 5,
        },
        { 'content-type': 'application/json' }
      );
      nock('https://api.mainnet.hiro.so').get(`/extended/v2/blocks/5`).reply(
        404,
        {
          error: 'Not found',
        },
        { 'content-type': 'application/json' }
      );
      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: principal,
        }),
        headers: { 'content-type': 'application/json' },
      });

      assert.strictEqual(response.statusCode, 422);
      assert.strictEqual(response.json().error, 'Contract deploy block not found');
    });

    test('successfully enqueues contract', async () => {
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT });

      await db.core.insertBlock(db.sql, {
        block_height: 5,
        index_block_hash: '0x242424',
        parent_index_block_hash: '0x000000',
        transactions: [],
      });
      nock('https://api.mainnet.hiro.so')
        .get(`/extended/v1/contract/${principal}`)
        .reply(
          200,
          {
            tx_id: '0x0101',
            canonical: true,
            contract_id: principal,
            block_height: 5,
            clarity_version: 2,
            source_code: 'test',
            abi: JSON.stringify(SIP_010_ABI),
          },
          { 'content-type': 'application/json' }
        );
      nock('https://api.mainnet.hiro.so').get(`/extended/v1/tx/0x0101`).reply(
        200,
        {
          tx_index: 5,
        },
        { 'content-type': 'application/json' }
      );
      nock('https://api.mainnet.hiro.so').get(`/extended/v2/blocks/5`).reply(
        200,
        {
          index_block_hash: '0x242424',
        },
        { 'content-type': 'application/json' }
      );
      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: principal,
        }),
        headers: { 'content-type': 'application/json' },
      });

      assert.strictEqual(response.statusCode, 200);
      const dbContract = await db.getSmartContract({ id: 1 });
      assert.strictEqual(dbContract?.sip, DbSipNumber.sip010);
      assert.strictEqual(dbContract?.principal, principal);
      const pendingJobs = await db.getPendingJobBatch({ limit: 1 });
      assert.strictEqual(pendingJobs.length, 1);
    });
  });
});
