import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbSipNumber } from '../../src/pg/types';
import {
  insertAndEnqueueTestContractWithTokens,
  startTestApiServer,
  TestFastifyServer,
} from '../helpers';

describe('Status routes', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
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
    expect(json).toStrictEqual({
      server_version: 'token-metadata-api v0.0.1 (test:123456)',
      status: 'ready',
      chain_tip: null,
    });
    const noVersionResponse = await fastify.inject({ method: 'GET', url: '/metadata/' });
    expect(response.statusCode).toEqual(noVersionResponse.statusCode);
    expect(json).toStrictEqual(noVersionResponse.json());
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
    expect(json).toStrictEqual({
      server_version: 'token-metadata-api v0.0.1 (test:123456)',
      status: 'ready',
      chain_tip: {
        block_height: 1,
        index_block_hash: '0x123',
      },
    });
  });
});
