import { strict as assert } from 'node:assert';
import { cycleMigrations } from '@stacks/api-toolkit';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store.js';
import { setupEnv, startTestApiServer, TestFastifyServer } from '../helpers.js';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('Status routes', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    setupEnv();
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await startTestApiServer(db);
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  test('returns status when nothing has been processed', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/metadata/v1/' });
    const json = response.json();
    assert.deepStrictEqual(json, {
      server_version: 'token-metadata-api v0.0.1 (test:123456)',
      status: 'ready',
      chain_tip: null,
    });
    const noVersionResponse = await fastify.inject({ method: 'GET', url: '/metadata/' });
    assert.strictEqual(response.statusCode, noVersionResponse.statusCode);
    assert.deepStrictEqual(json, noVersionResponse.json());
  });

  test('returns status when a block has been processed', async () => {
    await db.core.insertBlock(db.sql, {
      block_height: 1,
      index_block_hash: '0x123',
      parent_index_block_hash: '0x000000',
      transactions: [],
    });
    const response = await fastify.inject({ method: 'GET', url: '/metadata/v1/' });
    const json = response.json();
    assert.deepStrictEqual(json, {
      server_version: 'token-metadata-api v0.0.1 (test:123456)',
      status: 'ready',
      chain_tip: {
        block_height: 1,
        index_block_hash: '0x123',
      },
    });
  });
});
