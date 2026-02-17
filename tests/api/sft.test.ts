import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbSipNumber } from '../../src/pg/types';
import {
  insertAndEnqueueTestContract,
  insertAndEnqueueTestContractWithTokens,
  startTestApiServer,
  TestFastifyServer,
} from '../helpers';

describe('SFT routes', () => {
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

  test('contract not found', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/Contract not found/);
  });

  test('token not found', async () => {
    await insertAndEnqueueTestContract(
      db,
      'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1',
      DbSipNumber.sip013
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/Token not found/);
  });

  test('token not processed', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1',
      DbSipNumber.sip013,
      1n
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toStrictEqual({ error: 'Token metadata fetch in progress' });
  });

  test('invalid contract', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1',
      DbSipNumber.sip013,
      1n
    );
    await db.sql`UPDATE jobs SET status = 'invalid', invalid_reason = 109 WHERE id = 1`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toMatch(/Clarity error/);
  });

  test('invalid token metadata', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1',
      DbSipNumber.sip013,
      1n
    );
    await db.sql`UPDATE jobs SET status = 'invalid', invalid_reason = 105 WHERE id = 2`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toMatch(/Metadata could not be parsed/);
  });

  test('locale not found', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1',
      DbSipNumber.sip013,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: null,
          symbol: null,
          decimals: 6,
          total_supply: '200',
          uri: 'http://test.com/uri.json',
        },
        metadataLocales: [
          {
            metadata: {
              sip: 16,
              token_id: 1,
              name: 'key-alex-autoalex-v1',
              l10n_locale: 'en',
              l10n_uri: null,
              l10n_default: true,
              description: 'test',
              image: null,
              cached_image: null,
              cached_thumbnail_image: null,
            },
          },
        ],
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1?locale=es',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toStrictEqual({ error: 'Locale not found' });
  });

  test('empty metadata locales', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1',
      DbSipNumber.sip013,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: 'key-alex-autoalex-v1',
          symbol: null,
          decimals: 6,
          total_supply: '1',
          uri: 'http://test.com/uri.json',
        },
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      decimals: 6,
      total_supply: '1',
      token_uri: 'http://test.com/uri.json',
    });
  });

  test('valid SFT metadata', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1',
      DbSipNumber.sip013,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: null,
          symbol: null,
          decimals: 6,
          total_supply: '200',
          uri: 'http://test.com/uri.json',
        },
        metadataLocales: [
          {
            metadata: {
              sip: 16,
              token_id: 1,
              name: 'key-alex-autoalex-v1',
              l10n_locale: 'en',
              l10n_uri: null,
              l10n_default: true,
              description: 'test',
              image: 'http://test.com/image.png',
              cached_image: 'http://test.com/image.png?processed=true',
              cached_thumbnail_image: 'http://test.com/image.png?thumb=true',
            },
            attributes: [
              {
                trait_type: 'strength',
                display_type: 'number',
                value: 105,
              },
              {
                trait_type: 'powers',
                display_type: 'array',
                value: [1, 2, 4],
              },
            ],
            properties: [
              {
                name: 'prop1',
                value: 'ABC',
              },
              {
                name: 'prop2',
                value: 1,
              },
            ],
          },
        ],
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      token_uri: 'http://test.com/uri.json',
      decimals: 6,
      total_supply: '200',
      metadata: {
        sip: 16,
        description: 'test',
        name: 'key-alex-autoalex-v1',
        image: 'http://test.com/image.png',
        cached_image: 'http://test.com/image.png?processed=true',
        cached_thumbnail_image: 'http://test.com/image.png?thumb=true',
        attributes: [
          {
            display_type: 'number',
            trait_type: 'strength',
            value: 105,
          },
          {
            display_type: 'array',
            trait_type: 'powers',
            value: [1, 2, 4],
          },
        ],
        properties: {
          prop1: 'ABC',
          prop2: 1,
        },
      },
    });
    const noVersionResponse = await fastify.inject({
      method: 'GET',
      url: '/metadata/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toEqual(noVersionResponse.statusCode);
    expect(response.json()).toStrictEqual(noVersionResponse.json());

    // Test with canonical = false
    await db.sql`UPDATE tokens SET canonical = false WHERE id = 1`;
    const response2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response2.statusCode).toBe(404);
  });
});
