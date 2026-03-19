import { strict as assert } from 'node:assert';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContract,
  insertAndEnqueueTestContractWithTokens,
  startTestApiServer,
  TestFastifyServer,
} from '../helpers';
import { DbSipNumber } from '../../src/pg/types';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('NFT routes', () => {
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
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response.statusCode, 404);
    assert.match(response.json().error, /Contract not found/);
  });

  test('token not found', async () => {
    await insertAndEnqueueTestContract(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip009
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response.statusCode, 404);
    assert.match(response.json().error, /Token not found/);
  });

  test('token not processed', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip009,
      1n
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response.statusCode, 422);
    assert.deepStrictEqual(response.json(), { error: 'Token metadata fetch in progress' });
  });

  test('invalid contract', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip009,
      1n
    );
    await db.sql`UPDATE jobs SET status = 'invalid', invalid_reason = 109 WHERE id = 1`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response.statusCode, 422);
    assert.match(response.json().message, /Clarity error/);
  });

  test('invalid token metadata', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip009,
      1n
    );
    await db.sql`UPDATE jobs SET status = 'invalid', invalid_reason = 105 WHERE id = 2`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response.statusCode, 422);
    assert.match(response.json().message, /Metadata could not be parsed/);
  });

  test('locale not found', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip009,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: 'hello-world',
          symbol: null,
          decimals: null,
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
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1?locale=es',
    });
    assert.strictEqual(response.statusCode, 422);
    assert.deepStrictEqual(response.json(), { error: 'Locale not found' });
  });

  test('empty metadata locales', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip009,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: 'hello-world',
          symbol: null,
          decimals: null,
          total_supply: '1',
          uri: 'http://test.com/uri.json',
        },
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.json(), { token_uri: 'http://test.com/uri.json' });
  });

  test('valid NFT metadata', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip009,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: 'hello-world',
          symbol: null,
          decimals: null,
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
              {
                name: 'prop3',
                value: true,
              },
              {
                name: 'prop4',
                value: false,
              },
            ],
          },
        ],
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.json(), {
      token_uri: 'http://test.com/uri.json',
      metadata: {
        sip: 16,
        description: 'test',
        name: 'hello-world',
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
          prop3: true,
          prop4: false,
        },
      },
    });
    const noVersionResponse = await fastify.inject({
      method: 'GET',
      url: '/metadata/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response.statusCode, noVersionResponse.statusCode);
    assert.deepStrictEqual(response.json(), noVersionResponse.json());

    // Test with canonical = false
    await db.sql`UPDATE tokens SET canonical = false WHERE id = 1`;
    const response2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response2.statusCode, 404);
  });
});
