import { strict as assert } from 'node:assert';
import { mock } from 'node:test';
import { cvToHex, noneCV, stringUtf8CV, uintCV } from '@stacks/transactions';
import { errors, MockAgent, setGlobalDispatcher } from 'undici';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store.js';
import {
  DbJob,
  DbJobStatus,
  DbMetadataAttribute,
  DbMetadataProperty,
  DbSipNumber,
} from '../../src/pg/types.js';
import { ENV } from '../../src/env.js';
import { ProcessTokenJob } from '../../src/token-processor/queue/job/process-token-job.js';
import { parseRetryAfterResponseHeader } from '../../src/token-processor/util/helpers.js';
import { RetryableJobError } from '../../src/token-processor/queue/errors.js';
import { cycleMigrations } from '@stacks/api-toolkit';
import { insertAndEnqueueTestContractWithTokens, setupEnv } from '../helpers.js';
import { InvalidTokenError } from '../../src/pg/errors.js';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('ProcessTokenJob', () => {
  let db: PgStore;

  beforeEach(async () => {
    setupEnv();
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('FT', () => {
    let tokenJob: DbJob;

    beforeEach(async () => {
      [tokenJob] = await insertAndEnqueueTestContractWithTokens(
        db,
        'ABCD.test-ft',
        DbSipNumber.sip010,
        1n
      );
    });

    test('parses FT info', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(
        `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`
      );
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-name',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FooToken')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(noneCV()), // We'll do that in another test
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-symbol',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FOO')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-decimals',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(6)),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-total-supply',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(1997500000000)),
        });
      setGlobalDispatcher(agent);

      const processor = new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' });
      await processor.work();

      const token = await db.getToken({ id: 1 });
      assert.notStrictEqual(token, undefined);
      assert.strictEqual(token?.name, 'FooToken');
      assert.strictEqual(token?.symbol, 'FOO');
      assert.strictEqual(token?.decimals, 6);
      assert.strictEqual(token?.total_supply, '1997500000000');
    });

    test('keeps contract FT info if metadata fetch fails', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(
        `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`
      );
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-name',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FooToken')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-symbol',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FOO')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-decimals',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(6)),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-total-supply',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(1997500000000)),
        });
      agent
        .get('http://m.io')
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(500, { message: 'server error' })
        .persist();
      setGlobalDispatcher(agent);

      const processor = new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' });
      await processor.work();

      const token = await db.getToken({ id: 1 });
      assert.notStrictEqual(token, undefined);
      assert.strictEqual(token?.name, 'FooToken');
      assert.strictEqual(token?.symbol, 'FOO');
      assert.strictEqual(token?.decimals, 6);
      assert.strictEqual(token?.total_supply, '1997500000000');
      const bundle = await db.getTokenMetadataBundle({
        contractPrincipal: 'ABCD.test-ft',
        tokenNumber: 1,
      });
      assert.strictEqual(bundle?.metadataLocale, undefined);
    });

    test('accepts FTs with incorrect total supply return type', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(
        `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`
      );
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-name',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FooToken')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(noneCV()),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-symbol',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FOO')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-decimals',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(6)),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-total-supply',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          // Simulate an ALEX-style error when fetching `get-total-supply` for wrapped tokens.
          result: '0x080100000000000000000000000000001774',
        });
      setGlobalDispatcher(agent);

      const processor = new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' });
      await processor.work();

      const token = await db.getToken({ id: 1 });
      assert.notStrictEqual(token, undefined);
      assert.strictEqual(token?.name, 'FooToken');
      assert.strictEqual(token?.symbol, 'FOO');
      assert.strictEqual(token?.decimals, 6);
      assert.strictEqual(token?.total_supply, null);
    });

    test('accepts FTs with invalid image entries', async () => {
      // `image_location` is not a recognized field.
      const json = `{
        "name": "MEME Token",
        "symbol": "MEME",
        "decimals": 6,
        "total_supply": 6969696696.969696,
        "token_uri": "https://static.wixstatic.com/media/1f3f2b_21fe381c89284e328827e6c35f4b5513~mv2.png/v1/fill/w_952,h_966,al_c,q_90,usm_0.66_1.00_0.01,enc_auto/Untitled%20design%20-%202023-03-30T220301_142.png",
        "description": "$MEME, some random meme. Don't buy it.",
        "image_location": "https://static.wixstatic.com/media/1f3f2b_21fe381c89284e328827e6c35f4b5513~mv2.png/v1/fill/w_952,h_966,al_c,q_90,usm_0.66_1.00_0.01,enc_auto/Untitled%20design%20-%202023-03-30T220301_142.png",
        "tx_id": "0x0a24b5b49ef70222382cb3bf40faf98deb835ec3531be98ab5a20ac047220a0c",
        "sender_address": "SP2GEP37WGW6QRFHVDAM3XW9Z716SRS94FJXPZFT3",
        "metadata": {
          "sip": 16,
          "name": "MEME Token",
          "description": "$MEME, some random meme. Don't buy it.",
          "image": "https://static.wixstatic.com/media/1f3f2b_21fe381c89284e328827e6c35f4b5513~mv2.png/v1/fill/w_952,h_966,al_c,q_90,usm_0.66_1.00_0.01,enc_auto/Untitled%20design%20-%202023-03-30T220301_142.png",
          "cached_image": "https://static.wixstatic.com/media/1f3f2b_21fe381c89284e328827e6c35f4b5513~mv2.png/v1/fill/w_952,h_966,al_c,q_90,usm_0.66_1.00_0.01,enc_auto/Untitled%20design%20-%202023-03-30T220301_142.png"
        }
      }`;
      const agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get('https://www.100x.fi')
        .intercept({
          path: '/meme1.json',
          method: 'GET',
        })
        .reply(200, json);
      const interceptor = agent.get(
        `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`
      );
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-name',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('meme')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('https://www.100x.fi/meme1.json')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-symbol',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('MEME')),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-decimals',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(8)),
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-total-supply',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(2100000000000000)),
        });
      setGlobalDispatcher(agent);

      const processor = new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' });
      await processor.work();

      const token = await db.getTokenMetadataBundle({
        contractPrincipal: 'ABCD.test-ft',
        tokenNumber: 1,
      });
      assert.notStrictEqual(token, undefined);
      assert.strictEqual(token?.metadataLocale?.metadata?.image, null);
    });
  });

  describe('NFT', () => {
    let tokenJob: DbJob;

    beforeEach(async () => {
      [tokenJob] = await insertAndEnqueueTestContractWithTokens(
        db,
        'ABCD.test-nft',
        DbSipNumber.sip009,
        1n
      );
    });

    test('parses metadata with arbitrary types', async () => {
      const metadata = {
        name: 'Mutant Monkeys #1',
        image:
          'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w',
        attributes: [
          {
            trait_type: 'Background',
            value: 'MM1 Purple',
          },
          {
            trait_type: 'Fur',
            value: 5050,
            display_type: 'Number',
          },
          {
            trait_type: 'Clothes',
            value: ['hello', 'world'],
          },
        ],
        properties: {
          external_url: 'https://bitcoinmonkeys.io/',
          description:
            "Mutant Monkeys is a collection of 5,000 NFT's that were created by transforming a Bitcoin Monkeys Labs vial of Serum into a Mutant Monkey.",
          colection_name: 'Mutant Monkeys',
          collection_image:
            'https://byzantion.mypinata.cloud/ipfs/QmcsJmDdzutRYWg8e6E4Vqrs2Yon79BHfb14U3WnitwZSQ',
          collection_size: 5000,
          artist: 'Bitcoin Monkeys',
          prop: { a: 1, b: 2 },
          allow_multiple_claims: true,
          whitelisted: false,
        },
      };
      const agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata);
      setGlobalDispatcher(agent);

      await new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' }).work();

      const bundle = await db.getTokenMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
      });
      assert.notStrictEqual(bundle, undefined);
      assert.strictEqual(bundle?.token.uri, 'http://m.io/1.json');
      assert.strictEqual(bundle?.metadataLocale?.metadata.name, 'Mutant Monkeys #1');
      assert.strictEqual(
        bundle?.metadataLocale?.metadata.image,
        'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w'
      );
      assert.strictEqual(bundle?.metadataLocale?.metadata.description, null);

      const attr0 = bundle?.metadataLocale?.attributes[0];
      assert.strictEqual(attr0?.trait_type, 'Background');
      assert.strictEqual(attr0?.value as string, 'MM1 Purple');
      assert.strictEqual(attr0?.display_type, null);

      const attr1 = bundle?.metadataLocale?.attributes[1];
      assert.strictEqual(attr1?.trait_type, 'Fur');
      assert.strictEqual(attr1?.value as string, 5050);
      assert.strictEqual(attr1?.display_type, 'Number');

      const attr2 = bundle?.metadataLocale?.attributes[2];
      assert.strictEqual(attr2?.trait_type, 'Clothes');
      assert.deepStrictEqual(attr2?.value, ['hello', 'world']);
      assert.strictEqual(attr2?.display_type, null);

      const properties = bundle?.metadataLocale?.properties as DbMetadataProperty[];
      assert.strictEqual(properties[0].name, 'external_url');
      assert.strictEqual(properties[0].value, 'https://bitcoinmonkeys.io/');
      assert.strictEqual(properties[4].name, 'collection_size');
      assert.strictEqual(properties[4].value, 5000);
      assert.strictEqual(properties[6].name, 'prop');
      assert.deepStrictEqual(properties[6].value, { a: 1, b: 2 });
      assert.strictEqual(properties[7].name, 'allow_multiple_claims');
      assert.deepStrictEqual(properties[7].value, true);
      assert.strictEqual(properties[8].name, 'whitelisted');
      assert.deepStrictEqual(properties[8].value, false);
    });

    test('parses metadata with localizations', async () => {
      const metadata = {
        name: 'Mutant Monkeys #1',
        image:
          'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w',
        attributes: [
          {
            trait_type: 'Background',
            value: 'MM1 Purple',
          },
          {
            trait_type: 'Fur',
            value: 5050,
            display_type: 'Number',
          },
          {
            trait_type: 'Clothes',
            value: ['hello', 'world'],
          },
        ],
        properties: {
          external_url: 'https://bitcoinmonkeys.io/',
          description:
            "Mutant Monkeys is a collection of 5,000 NFT's that were created by transforming a Bitcoin Monkeys Labs vial of Serum into a Mutant Monkey.",
          colection_name: 'Mutant Monkeys',
          artist: 'Bitcoin Monkeys',
        },
        localization: {
          uri: 'http://m-locale.io/{id}-{locale}.json',
          default: 'en',
          locales: ['en', 'es-MX'],
        },
      };
      const metadataSpanish = {
        name: 'Changos Mutantes #1',
        attributes: [
          {
            trait_type: 'Fondo',
            value: 'MM1 Morado',
          },
        ],
        properties: {
          description: "Changos Mutantes es una colección de 5,000 NFT's",
          colection_name: 'Changos Mutantes',
        },
      };
      const agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata);
      agent
        .get(`http://m-locale.io`)
        .intercept({
          path: '/1-es-MX.json',
          method: 'GET',
        })
        .reply(200, metadataSpanish);
      setGlobalDispatcher(agent);

      await new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' }).work();

      const bundle = await db.getTokenMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
      });
      assert.notStrictEqual(bundle, undefined);
      assert.strictEqual(bundle?.token.uri, 'http://m.io/1.json');
      assert.strictEqual(bundle?.metadataLocale?.metadata.l10n_locale, 'en');
      assert.strictEqual(bundle?.metadataLocale?.metadata.l10n_default, true);
      assert.strictEqual(bundle?.metadataLocale?.metadata.l10n_uri, 'http://m.io/1.json');

      // Make sure localization overrides work correctly
      const mexicanBundle = await db.getTokenMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
        locale: 'es-MX',
      });
      assert.notStrictEqual(mexicanBundle, undefined);
      assert.strictEqual(mexicanBundle?.token.uri, 'http://m.io/1.json');
      assert.strictEqual(mexicanBundle?.metadataLocale?.metadata.l10n_locale, 'es-MX');
      assert.strictEqual(mexicanBundle?.metadataLocale?.metadata.l10n_default, false);
      assert.strictEqual(
        mexicanBundle?.metadataLocale?.metadata.l10n_uri,
        'http://m-locale.io/1-es-MX.json'
      );
      assert.strictEqual(mexicanBundle?.metadataLocale?.metadata.name, 'Changos Mutantes #1');
      assert.strictEqual(
        mexicanBundle?.metadataLocale?.metadata.image,
        'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w'
      );
      assert.strictEqual(mexicanBundle?.metadataLocale?.metadata.description, null);
      const attributes = mexicanBundle?.metadataLocale?.attributes as DbMetadataAttribute[];
      assert.strictEqual(attributes.length, 1);
      assert.strictEqual(attributes[0].trait_type, 'Fondo');
      assert.strictEqual(attributes[0].value, 'MM1 Morado');
      const properties = mexicanBundle?.metadataLocale?.properties as DbMetadataProperty[];
      assert.strictEqual(properties[0].name, 'external_url');
      assert.strictEqual(properties[0].value, 'https://bitcoinmonkeys.io/');
      assert.strictEqual(properties[1].name, 'description');
      assert.strictEqual(properties[1].value, "Changos Mutantes es una colección de 5,000 NFT's");
      assert.strictEqual(properties[2].name, 'colection_name');
      assert.strictEqual(properties[2].value, 'Changos Mutantes');
      assert.strictEqual(properties[3].name, 'artist');
      assert.strictEqual(properties[3].value, 'Bitcoin Monkeys');
    });

    test('metadata refresh replaces previous metadata entries for token', async () => {
      const metadata1 = {
        name: 'Mutant Monkeys #1',
        image:
          'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w',
        attributes: [
          {
            trait_type: 'Background',
            value: 'MM1 Purple',
          },
        ],
        properties: {
          external_url: 'https://bitcoinmonkeys.io/',
          colection_name: 'Mutant Monkeys',
        },
      };
      const metadata2 = {
        name: 'Mutant Monkeys #1 NEW',
        image: 'https://byzantion.mypinata.cloud/ipfs/new',
        attributes: [
          {
            trait_type: 'New Background',
            value: 'MM1 Red',
          },
        ],
        properties: {
          colection_name: 'Mutant Monkeys Reloaded',
        },
      };
      const agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata1);
      setGlobalDispatcher(agent);

      // Process once
      await new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' }).work();

      const bundle1 = await db.getTokenMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
      });
      assert.notStrictEqual(bundle1, undefined);
      assert.strictEqual(bundle1?.token.uri, 'http://m.io/1.json');
      assert.strictEqual(bundle1?.metadataLocale?.metadata.name, 'Mutant Monkeys #1');
      assert.strictEqual(
        bundle1?.metadataLocale?.metadata.image,
        'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w'
      );
      assert.strictEqual(bundle1?.metadataLocale?.attributes.length, 1);
      assert.strictEqual(bundle1?.metadataLocale?.attributes[0].trait_type, 'Background');
      assert.strictEqual(bundle1?.metadataLocale?.attributes[0].value as string, 'MM1 Purple');
      assert.strictEqual(bundle1?.metadataLocale?.properties.length, 2);
      assert.strictEqual(bundle1?.metadataLocale?.properties[0].name, 'external_url');
      assert.strictEqual(
        bundle1?.metadataLocale?.properties[0].value as string,
        'https://bitcoinmonkeys.io/'
      );
      assert.strictEqual(bundle1?.metadataLocale?.properties[1].name, 'colection_name');
      assert.strictEqual(bundle1?.metadataLocale?.properties[1].value as string, 'Mutant Monkeys');

      // Process again with different metadata
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata2);
      await db.core.updateJobStatus({ id: tokenJob.id, status: DbJobStatus.pending });
      await new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' }).work();

      const bundle2 = await db.getTokenMetadataBundle({
        contractPrincipal: 'ABCD.test-nft',
        tokenNumber: 1,
      });
      assert.notStrictEqual(bundle2, undefined);
      assert.strictEqual(bundle2?.token.uri, 'http://m.io/1.json');
      assert.strictEqual(bundle2?.metadataLocale?.metadata.name, 'Mutant Monkeys #1 NEW');
      assert.strictEqual(
        bundle2?.metadataLocale?.metadata.image,
        'https://byzantion.mypinata.cloud/ipfs/new'
      );
      assert.strictEqual(bundle2?.metadataLocale?.attributes.length, 1);
      assert.strictEqual(bundle2?.metadataLocale?.attributes[0].trait_type, 'New Background');
      assert.strictEqual(bundle2?.metadataLocale?.attributes[0].value as string, 'MM1 Red');
      assert.strictEqual(bundle2?.metadataLocale?.properties.length, 1);
      assert.strictEqual(bundle2?.metadataLocale?.properties[0].name, 'colection_name');
      assert.strictEqual(
        bundle2?.metadataLocale?.properties[0].value as string,
        'Mutant Monkeys Reloaded'
      );
    });

    test('SIP-016 non-compliant metadata throws error', async () => {
      const metadata = {
        id: '62624cc0065e986192fb9f33',
        media: 'https://sf-stage-s3.s3.us-west-1.amazonaws.com/riyasen_suit.png',
        title: 'Inner Circle',
        primaryPrice: 'USD 25',
        ownerSuperfandomId: '618273560f040f78926d75d4',
        auctionDate: '2022-04-22T06:30:00.000Z',
        totalEditions: 100,
        currentEdition: 67,
        editionNft: true,
      };
      const agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata);
      setGlobalDispatcher(agent);

      await new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' }).work();

      await assert.rejects(
        () =>
          db.getTokenMetadataBundle({
            contractPrincipal: 'ABCD.test-nft',
            tokenNumber: 1,
          }),
        InvalidTokenError
      );
    });
  });

  describe('SFT', () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = 'key-alex-autoalex-v1';
    let tokenJob: DbJob;

    beforeEach(async () => {
      [tokenJob] = await insertAndEnqueueTestContractWithTokens(
        db,
        `${address}.${contractId}`,
        DbSipNumber.sip013,
        1n
      );
    });

    test('parses SFT info', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(
        `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`
      );
      interceptor
        .intercept({
          path: `/v2/contracts/call-read/${address}/${contractId}/get-token-uri`,
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(noneCV()), // We'll do that in another test
        });
      interceptor
        .intercept({
          path: `/v2/contracts/call-read/${address}/${contractId}/get-decimals`,
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(6)),
        });
      interceptor
        .intercept({
          path: `/v2/contracts/call-read/${address}/${contractId}/get-total-supply`,
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(200200200)),
        });
      setGlobalDispatcher(agent);

      const processor = new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' });
      await processor.work();

      const token = await db.getToken({ id: 1 });
      assert.notStrictEqual(token, undefined);
      assert.strictEqual(token?.uri, null);
      assert.strictEqual(token?.decimals, 6);
      assert.strictEqual(token?.total_supply, '200200200');
    });
  });

  describe('Rate limits', () => {
    let tokenJob: DbJob;
    let agent: MockAgent;

    beforeEach(async () => {
      [tokenJob] = await insertAndEnqueueTestContractWithTokens(
        db,
        'ABCD.test-nft',
        DbSipNumber.sip009,
        1n
      );

      agent = new MockAgent();
      agent.disableNetConnect();
      agent
        .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-nft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('http://m.io/{id}.json')),
        });
      setGlobalDispatcher(agent);
    });

    test('parses Retry-After response header correctly', () => {
      // Numeric value
      const error1 = new errors.ResponseError('rate limited', 429, {
        headers: { 'retry-after': '120' },
      });
      assert.strictEqual(parseRetryAfterResponseHeader(error1), 120);

      // Date string
      const now = Date.now();
      mock.timers.enable({ apis: ['Date'], now });
      try {
        const inOneHour = now + 3600 * 1000;
        const error2 = new errors.ResponseError('rate limited', 429, {
          headers: { 'retry-after': new Date(inOneHour).toUTCString() },
        });
        assert.strictEqual(parseRetryAfterResponseHeader(error2), 3600);

        mock.timers.setTime(new Date('2015-10-21').getTime());
        const error5 = new errors.ResponseError('rate limited', 429, {
          headers: { 'retry-after': 'Wed, 21 Oct 2015 07:28:00 GMT' },
        });
        assert.strictEqual(parseRetryAfterResponseHeader(error5), 26880);

        // Empty value
        const error3 = new errors.ResponseError('rate limited', 429, {
          headers: {},
        });
        assert.strictEqual(parseRetryAfterResponseHeader(error3), undefined);

        // Non-429 value
        const error4 = new errors.ResponseError('rate limited', 500, {
          headers: { 'retry-after': '999' },
        });
        assert.strictEqual(parseRetryAfterResponseHeader(error4), undefined);
      } finally {
        mock.timers.reset();
      }
    });

    test('saves rate limited hosts', async () => {
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(429, { error: 'nope' }, { headers: { 'retry-after': '999' } });
      await assert.doesNotReject(
        new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' }).work()
      );
      const host = await db.getRateLimitedHost({ hostname: 'm.io' });
      assert.notStrictEqual(host, undefined);
    });

    test('skips request to rate limited host', async () => {
      await db.core.insertRateLimitedHost({
        values: {
          hostname: 'm.io',
          retry_after: 99999,
        },
      });
      await assert.rejects(
        new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' }).handler(),
        /skipping fetch to rate-limited hostname/
      );
      const host = await db.getRateLimitedHost({ hostname: 'm.io' });
      assert.notStrictEqual(host, undefined);
    });

    test('resumes calls if retry-after is complete', async () => {
      const metadata = {
        name: 'Mutant Monkeys #1',
        image:
          'https://byzantion.mypinata.cloud/ipfs/QmWAYP9LJD15mgrnapfpJhBArG6T3J4XKTM77tzqggvP7w',
        attributes: [
          {
            trait_type: 'Background',
            value: 'MM1 Purple',
          },
        ],
        properties: {
          external_url: 'https://bitcoinmonkeys.io/',
          colection_name: 'Mutant Monkeys',
        },
      };
      agent
        .get(`http://m.io`)
        .intercept({
          path: '/1.json',
          method: 'GET',
        })
        .reply(200, metadata);
      // Insert manually so we can set date in the past
      await db.sql`
        INSERT INTO rate_limited_hosts (hostname, created_at, retry_after)
        VALUES ('m.io', DEFAULT, NOW() - INTERVAL '40 minutes')
      `;

      // Token is processed now.
      await assert.doesNotReject(
        new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' }).handler()
      );

      // Rate limited host is gone.
      const host = await db.getRateLimitedHost({ hostname: 'm.io' });
      assert.strictEqual(host, undefined);
    });
  });

  test('Contract not found gets retried', async () => {
    const nodeUrl = `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`;
    const [tokenJob] = await insertAndEnqueueTestContractWithTokens(
      db,
      'ABCD.test-nft',
      DbSipNumber.sip009,
      1n
    );

    const mockResponse = {
      okay: false,
      cause: `Unchecked(NoSuchContract("ABCD.test-nft"))`,
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/ABCD/test-nft/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    await assert.rejects(
      new ProcessTokenJob({ db, job: tokenJob, network: 'mainnet' }).handler(),
      RetryableJobError
    );
  });
});
