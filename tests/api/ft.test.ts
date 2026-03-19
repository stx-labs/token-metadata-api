import { strict as assert } from 'node:assert';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbFungibleTokenMetadataItem, DbSipNumber } from '../../src/pg/types';
import {
  insertAndEnqueueTestContract,
  insertAndEnqueueTestContractWithTokens,
  startTestApiServer,
  TestFastifyServer,
} from '../helpers';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('FT routes', () => {
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
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response.statusCode, 404);
    assert.match(response.json().error, /Contract not found/);
  });

  test('token not found', async () => {
    await insertAndEnqueueTestContract(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response.statusCode, 404);
    assert.match(response.json().error, /Token not found/);
  });

  test('token not processed', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010,
      1n
    );
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response.statusCode, 422);
    assert.deepStrictEqual(response.json(), { error: 'Token metadata fetch in progress' });
  });

  test('invalid contract', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010,
      1n
    );
    await db.sql`UPDATE jobs SET status = 'invalid', invalid_reason = 109 WHERE id = 1`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response.statusCode, 422);
    assert.match(response.json().message, /Clarity error/);
  });

  test('invalid token metadata', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010,
      1n
    );
    await db.sql`UPDATE jobs SET status = 'invalid', invalid_reason = 105 WHERE id = 2`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response.statusCode, 422);
    assert.match(response.json().message, /Metadata could not be parsed/);
  });

  test('locale not found', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010,
      1n
    );
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
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world?locale=es',
    });
    assert.strictEqual(response.statusCode, 422);
    assert.deepStrictEqual(response.json(), { error: 'Locale not found' });
  });

  test('empty metadata locales', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010,
      1n
    );
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
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.json(), {
      decimals: 6,
      name: 'hello-world',
      symbol: 'HELLO',
      token_uri: 'http://test.com/uri.json',
      total_supply: '1',
      sender_address: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS',
      asset_identifier: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world::ft-token',
      tx_id: '0x123456',
    });
  });

  test('valid FT metadata', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010,
      1n
    );
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
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.json(), {
      name: 'hello-world',
      symbol: 'HELLO',
      token_uri: 'http://test.com/uri.json',
      total_supply: '1',
      decimals: 6,
      sender_address: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS',
      asset_identifier: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world::ft-token',
      tx_id: '0x123456',
      description: 'test',
      image_canonical_uri: 'http://test.com/image.png',
      image_thumbnail_uri: 'http://test.com/image.png?thumb=true',
      image_uri: 'http://test.com/image.png?processed=true',
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
        },
      },
    });
    const noVersionResponse = await fastify.inject({
      method: 'GET',
      url: '/metadata/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response.statusCode, noVersionResponse.statusCode);
    assert.deepStrictEqual(response.json(), noVersionResponse.json());

    // Test with canonical = false
    await db.sql`UPDATE tokens SET canonical = false WHERE id = 1`;
    const response2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    assert.strictEqual(response2.statusCode, 404);
  });

  describe('index', () => {
    const insertFt = async (item: DbFungibleTokenMetadataItem, skipMetadata: boolean = false) => {
      const [tokenJob] = await insertAndEnqueueTestContractWithTokens(
        db,
        item.principal,
        DbSipNumber.sip010,
        1n,
        item.tx_id
      );
      await db.core.updateProcessedTokenWithMetadata({
        id: tokenJob.token_id ?? 0,
        values: {
          token: {
            name: item.name,
            symbol: item.symbol,
            decimals: item.decimals,
            total_supply: item.total_supply?.toString(),
            uri: item.uri ?? null,
          },
          metadataLocales: skipMetadata
            ? []
            : [
                {
                  metadata: {
                    sip: 16,
                    token_id: tokenJob.token_id ?? 0,
                    name: item.name ?? '',
                    l10n_locale: 'en',
                    l10n_uri: null,
                    l10n_default: true,
                    description: item.description ?? '',
                    image: item.image ?? '',
                    cached_image: item.cached_image ?? '',
                    cached_thumbnail_image: item.cached_thumbnail_image ?? '',
                  },
                },
              ],
        },
      });
    };

    const insertFtList = async () => {
      await insertFt({
        name: 'Meme token',
        symbol: 'MEME',
        decimals: 5,
        description: 'Meme',
        tx_id: '0xbdc41843d5e0cd4a70611f6badeb5c87b07b12309e77c4fbaf2334c7b4cee89b',
        principal: 'SP22PCWZ9EJMHV4PHVS0C8H3B3E4Q079ZHY6CXDS1.meme-token',
        total_supply: '200000',
        image: 'http://img.com/meme.jpg',
        cached_image: 'http://img.com/meme.jpg',
        uri: 'https://ipfs.io/abcd.json',
      });
      await insertFt({
        name: 'miamicoin',
        symbol: 'MIA',
        decimals: 6,
        total_supply: '5586789829000000',
        uri: 'https://cdn.citycoins.co/metadata/miamicoin.json',
        description: 'A CityCoin for Miami, ticker is MIA, Stack it to earn Stacks (STX)',
        image: 'https://cdn.citycoins.co/logos/miamicoin.png',
        cached_image: 'https://cdn.citycoins.co/logos/miamicoin.png',
        tx_id: '0xa80a44790929467693ccb33a212cf50878a6ad572c4c5b8e7d9a5de794fbefa2',
        principal: 'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2',
      });
      await insertFt({
        name: 'STACKSWAP',
        symbol: 'STSW',
        decimals: 6,
        total_supply: '1000000000000000',
        uri: 'https://app.stackswap.org/token/stsw.json',
        description: 'StackSwap Project',
        image: 'https://app.stackswap.org/icon/stsw.svg',
        cached_image: 'https://app.stackswap.org/icon/stsw.svg',
        tx_id: '0x3edffbd025ca2c29cfde8c583c0e0babacd4aa21075d10307d37c64ae78d579e',
        principal: 'SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.stsw-token-v4a',
      });
    };

    test('shows a list of tokens', async () => {
      await insertFtList();
      const response = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft',
      });
      assert.strictEqual(response.statusCode, 200);
      const json = response.json();
      assert.strictEqual(json.total, 3);
      assert.deepStrictEqual(json.results[0], {
        decimals: 5,
        description: 'Meme',
        image_canonical_uri: 'http://img.com/meme.jpg',
        image_uri: 'http://img.com/meme.jpg',
        name: 'Meme token',
        sender_address: 'SP22PCWZ9EJMHV4PHVS0C8H3B3E4Q079ZHY6CXDS1',
        asset_identifier: 'SP22PCWZ9EJMHV4PHVS0C8H3B3E4Q079ZHY6CXDS1.meme-token::ft-token',
        symbol: 'MEME',
        token_uri: 'https://ipfs.io/abcd.json',
        total_supply: '200000',
        tx_id: '0xbdc41843d5e0cd4a70611f6badeb5c87b07b12309e77c4fbaf2334c7b4cee89b',
        contract_principal: 'SP22PCWZ9EJMHV4PHVS0C8H3B3E4Q079ZHY6CXDS1.meme-token',
      });
      assert.deepStrictEqual(json.results[1], {
        decimals: 6,
        description: 'A CityCoin for Miami, ticker is MIA, Stack it to earn Stacks (STX)',
        image_canonical_uri: 'https://cdn.citycoins.co/logos/miamicoin.png',
        image_uri: 'https://cdn.citycoins.co/logos/miamicoin.png',
        name: 'miamicoin',
        sender_address: 'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R',
        asset_identifier: 'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2::ft-token',
        symbol: 'MIA',
        token_uri: 'https://cdn.citycoins.co/metadata/miamicoin.json',
        total_supply: '5586789829000000',
        tx_id: '0xa80a44790929467693ccb33a212cf50878a6ad572c4c5b8e7d9a5de794fbefa2',
        contract_principal: 'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2',
      });
      assert.deepStrictEqual(json.results[2], {
        decimals: 6,
        description: 'StackSwap Project',
        image_canonical_uri: 'https://app.stackswap.org/icon/stsw.svg',
        image_uri: 'https://app.stackswap.org/icon/stsw.svg',
        name: 'STACKSWAP',
        sender_address: 'SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275',
        asset_identifier: 'SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.stsw-token-v4a::ft-token',
        symbol: 'STSW',
        token_uri: 'https://app.stackswap.org/token/stsw.json',
        total_supply: '1000000000000000',
        tx_id: '0x3edffbd025ca2c29cfde8c583c0e0babacd4aa21075d10307d37c64ae78d579e',
        contract_principal: 'SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.stsw-token-v4a',
      });
    });

    test('filters by name', async () => {
      await insertFtList();
      const response = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?name=miami', // Partial match
      });
      assert.strictEqual(response.statusCode, 200);
      const json = response.json();
      assert.strictEqual(json.total, 1);
      assert.strictEqual(json.results[0].symbol, 'MIA');

      const response2 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?name=nothing', // No match
      });
      assert.strictEqual(response2.statusCode, 200);
      const json2 = response2.json();
      assert.strictEqual(json2.total, 0);

      const response3 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?name=Miami', // Case insensitive
      });
      assert.strictEqual(response3.statusCode, 200);
      const json3 = response3.json();
      assert.strictEqual(json3.total, 1);
      assert.strictEqual(json3.results[0].symbol, 'MIA');

      // Test a token without SIP-16 metadata
      await insertFt(
        {
          name: 'Scam token',
          symbol: 'rstSTX',
          decimals: 5,
          tx_id: '0xbdc41843d5e0cd4a70611f6badeb5c87b07b12309e77c4fbaf2334c7b4cee89b',
          principal: 'SP22PCWZ9EJMHV4PHVS0C8H3B3E4Q079ZHY6CXDS1.scam-token',
          total_supply: '200000',
        },
        true
      );
      const response4 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?name=scam',
      });
      assert.strictEqual(response4.statusCode, 200);
      const json4 = response4.json();
      assert.strictEqual(json4.total, 1);
      assert.strictEqual(json4.results[0].symbol, 'rstSTX');
    });

    test('filters by valid metadata', async () => {
      await insertFtList();
      await insertFt(
        {
          name: 'Scam token',
          symbol: 'rstSTX',
          decimals: 5,
          tx_id: '0xbdc41843d5e0cd4a70611f6badeb5c87b07b12309e77c4fbaf2334c7b4cee89b',
          principal: 'SP22PCWZ9EJMHV4PHVS0C8H3B3E4Q079ZHY6CXDS1.scam-token',
          total_supply: '200000',
        },
        true
      );

      const response = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft',
      });
      assert.strictEqual(response.statusCode, 200);
      const json = response.json();
      assert.strictEqual(json.total, 4);

      const response2 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?valid_metadata_only=true',
      });
      assert.strictEqual(response2.statusCode, 200);
      const json2 = response2.json();
      assert.strictEqual(json2.total, 3);
    });

    test('filters by symbol', async () => {
      await insertFtList();
      const response = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?symbol=MIA',
      });
      assert.strictEqual(response.statusCode, 200);
      const json = response.json();
      assert.strictEqual(json.total, 1);
      assert.strictEqual(json.results[0].symbol, 'MIA');

      const response2 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?symbol=nothing', // No match
      });
      assert.strictEqual(response2.statusCode, 200);
      const json2 = response2.json();
      assert.strictEqual(json2.total, 0);

      const response3 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?symbol=mia', // Case insensitive
      });
      assert.strictEqual(response3.statusCode, 200);
      const json3 = response3.json();
      assert.strictEqual(json3.total, 1);
      assert.strictEqual(json3.results[0].symbol, 'MIA');
    });

    test('filters by address', async () => {
      await insertFtList();
      const response = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?address=SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R',
      });
      assert.strictEqual(response.statusCode, 200);
      const json = response.json();
      assert.strictEqual(json.total, 1);
      assert.strictEqual(json.results[0].symbol, 'MIA');

      const response2 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?address=SP1GK6VGCQQGP1PXH5676BY0334CZC41EAA7K1EK3', // No match
      });
      assert.strictEqual(response2.statusCode, 200);
      const json2 = response2.json();
      assert.strictEqual(json2.total, 0);
    });

    test('sorts by name', async () => {
      await insertFtList();
      const response1 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?order_by=name&order=asc',
      });
      assert.strictEqual(response1.statusCode, 200);
      const json1 = response1.json();
      assert.strictEqual(json1.total, 3);
      assert.strictEqual(json1.results[0].symbol, 'MEME');
      assert.strictEqual(json1.results[1].symbol, 'MIA');
      assert.strictEqual(json1.results[2].symbol, 'STSW');

      const response2 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?order_by=name&order=desc',
      });
      assert.strictEqual(response2.statusCode, 200);
      const json2 = response2.json();
      assert.strictEqual(json2.total, 3);
      assert.strictEqual(json2.results[0].symbol, 'STSW');
      assert.strictEqual(json2.results[1].symbol, 'MIA');
      assert.strictEqual(json2.results[2].symbol, 'MEME');
    });

    test('sorts by symbol', async () => {
      await insertFtList();
      const response1 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?order_by=symbol&order=asc',
      });
      assert.strictEqual(response1.statusCode, 200);
      const json1 = response1.json();
      assert.strictEqual(json1.total, 3);
      assert.strictEqual(json1.results[0].symbol, 'MEME');
      assert.strictEqual(json1.results[1].symbol, 'MIA');
      assert.strictEqual(json1.results[2].symbol, 'STSW');

      const response2 = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?order_by=symbol&order=desc',
      });
      assert.strictEqual(response2.statusCode, 200);
      const json2 = response2.json();
      assert.strictEqual(json2.total, 3);
      assert.strictEqual(json2.results[0].symbol, 'STSW');
      assert.strictEqual(json2.results[1].symbol, 'MIA');
      assert.strictEqual(json2.results[2].symbol, 'MEME');
    });
  });
});
