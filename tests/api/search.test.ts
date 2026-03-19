import { strict as assert } from 'node:assert';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbSipNumber } from '../../src/pg/types';
import {
  insertAndEnqueueTestContractWithTokens,
  startTestApiServer,
  TestFastifyServer,
} from '../helpers';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('Search routes', () => {
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

  async function insertFtWithMetadata(principal: string, name: string, symbol: string) {
    const [tokenJob] = await insertAndEnqueueTestContractWithTokens(
      db,
      principal,
      DbSipNumber.sip010,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
      id: tokenJob.token_id ?? 0,
      values: {
        token: {
          name,
          symbol,
          decimals: 6,
          total_supply: '1000000',
          uri: 'http://test.com/uri.json',
        },
        metadataLocales: [
          {
            metadata: {
              sip: 16,
              token_id: tokenJob.token_id ?? 0,
              name,
              l10n_locale: 'en',
              l10n_uri: null,
              l10n_default: true,
              description: `${name} description`,
              image: 'http://test.com/image.png',
              cached_image: 'http://test.com/image.png?processed=true',
              cached_thumbnail_image: 'http://test.com/image.png?thumb=true',
            },
          },
        ],
      },
    });
  }

  async function insertNftWithMetadata(principal: string, name: string, tokenCount: bigint = 1n) {
    const jobs = await insertAndEnqueueTestContractWithTokens(
      db,
      principal,
      DbSipNumber.sip009,
      tokenCount
    );
    for (const job of jobs) {
      await db.core.updateProcessedTokenWithMetadata({
        id: job.token_id ?? 0,
        values: {
          token: {
            name,
            symbol: null,
            decimals: null,
            total_supply: null,
            uri: 'http://test.com/nft-uri.json',
          },
          metadataLocales: [
            {
              metadata: {
                sip: 16,
                token_id: job.token_id ?? 0,
                name,
                l10n_locale: 'en',
                l10n_uri: null,
                l10n_default: true,
                description: `${name} NFT`,
                image: null,
                cached_image: null,
                cached_thumbnail_image: null,
              },
            },
          ],
        },
      });
    }
  }

  test('single FT contract returns correct response', async () => {
    await insertFtWithMetadata(
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      'Hello World',
      'HELLO'
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/search?contract=SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response.statusCode, 200);
    const json = response.json();
    assert.strictEqual(json.length, 1);
    assert.deepStrictEqual(json[0], {
      contract_id: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      token_number: 1,
      token_type: 'ft',
      name: 'Hello World',
      symbol: 'HELLO',
      decimals: 6,
      total_supply: '1000000',
      token_uri: 'http://test.com/uri.json',
      description: 'Hello World description',
      image_uri: 'http://test.com/image.png?processed=true',
      image_thumbnail_uri: 'http://test.com/image.png?thumb=true',
      image_canonical_uri: 'http://test.com/image.png',
      tx_id: '0x123456',
      sender_address: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS',
    });
  });

  test('mixed token types (FT + NFT) in one request', async () => {
    await insertFtWithMetadata(
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      'Hello World',
      'HELLO'
    );
    await insertNftWithMetadata(
      'SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12',
      'Boombox'
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/search?contract=SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world&contract=SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12',
    });
    assert.strictEqual(response.statusCode, 200);
    const json = response.json();
    assert.strictEqual(json.length, 2);
    assert.strictEqual(
      json.find((r: any) => r.token_type === 'ft').contract_id,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world'
    );
    assert.strictEqual(
      json.find((r: any) => r.token_type === 'nft').contract_id,
      'SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12'
    );
  });

  test('non-existent contracts omitted from results', async () => {
    await insertFtWithMetadata(
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      'Hello World',
      'HELLO'
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/search?contract=SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world&contract=SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.does-not-exist',
    });
    assert.strictEqual(response.statusCode, 200);
    const json = response.json();
    assert.strictEqual(json.length, 1);
    assert.strictEqual(
      json[0].contract_id,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world'
    );
  });

  test('NFT with specific token number', async () => {
    await insertNftWithMetadata(
      'SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12',
      'Boombox',
      3n
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/search?contract=SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12:3',
    });
    assert.strictEqual(response.statusCode, 200);
    const json = response.json();
    assert.strictEqual(json.length, 1);
    assert.strictEqual(json[0].token_number, 3);
  });

  test('locale parameter works', async () => {
    const [tokenJob] = await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
      id: tokenJob.token_id ?? 0,
      values: {
        token: {
          name: 'Hello World',
          symbol: 'HELLO',
          decimals: 6,
          total_supply: '1000000',
          uri: 'http://test.com/uri.json',
        },
        metadataLocales: [
          {
            metadata: {
              sip: 16,
              token_id: tokenJob.token_id ?? 0,
              name: 'Hello World',
              l10n_locale: 'en',
              l10n_uri: null,
              l10n_default: true,
              description: 'English description',
              image: null,
              cached_image: null,
              cached_thumbnail_image: null,
            },
          },
          {
            metadata: {
              sip: 16,
              token_id: tokenJob.token_id ?? 0,
              name: 'Hola Mundo',
              l10n_locale: 'es',
              l10n_uri: null,
              l10n_default: false,
              description: 'Descripcion en espanol',
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
      url: '/metadata/v1/search?contract=SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world&locale=es',
    });
    assert.strictEqual(response.statusCode, 200);
    const json = response.json();
    assert.strictEqual(json.length, 1);
    assert.strictEqual(json[0].description, 'Descripcion en espanol');
  });

  test('empty contract list returns 400', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/search',
    });
    assert.strictEqual(response.statusCode, 400);
  });
});
