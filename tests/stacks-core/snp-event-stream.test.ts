import { cvToHex, tupleCV, bufferCV, uintCV, stringUtf8CV } from '@stacks/transactions';
import { DbSipNumber } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContractWithTokens,
  markAllJobsAsDone,
  TestTransactionBuilder,
  TestBlockBuilder,
} from '../helpers';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor';

describe('SNP event stream', () => {
  let db: PgStore;
  let processor: StacksCoreBlockProcessor;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
    processor = new StacksCoreBlockProcessor({ db: db.core });
  });

  afterEach(async () => {
    await db.close();
  });

  // describe('chain tip', () => {
  //   test('updates chain tip on chainhook event', async () => {
  //     await db.chainhook.processPayload(
  //       new TestChainhookPayloadBuilder()
  //         .apply()
  //         .block({ height: 100 })
  //         .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
  //         .contractDeploy('SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft', {
  //           maps: [],
  //           functions: [],
  //           variables: [],
  //           fungible_tokens: [],
  //           non_fungible_tokens: [],
  //         })
  //         .build()
  //     );
  //     await expect(db.getChainTipBlockHeight()).resolves.toBe(100);

  //     await db.chainhook.processPayload(
  //       new TestChainhookPayloadBuilder()
  //         .apply()
  //         .block({ height: 101 })
  //         .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
  //         .event({
  //           type: 'SmartContractEvent',
  //           position: { index: 0 },
  //           data: {
  //             contract_identifier: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
  //             topic: 'print',
  //             raw_value: cvToHex(stringUtf8CV('test')),
  //           },
  //         })
  //         .build()
  //     );
  //     await expect(db.getChainTipBlockHeight()).resolves.toBe(101);
  //   });

  //   test('enqueues dynamic tokens for refresh with standard interval', async () => {
  //     const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
  //     const contractId = `${address}.friedger-pool-nft`;
  //     ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 86400;
  //     await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
  //     // Mark as dynamic
  //     await db.chainhook.processPayload(
  //       new TestChainhookPayloadBuilder()
  //         .apply()
  //         .block({ height: 90 })
  //         .transaction({ hash: '0x01', sender: address })
  //         .event({
  //           type: 'SmartContractEvent',
  //           position: { index: 0 },
  //           data: {
  //             contract_identifier: contractId,
  //             topic: 'print',
  //             raw_value: cvToHex(
  //               tupleCV({
  //                 notification: bufferCV(Buffer.from('token-metadata-update')),
  //                 payload: tupleCV({
  //                   'token-class': bufferCV(Buffer.from('nft')),
  //                   'contract-id': bufferCV(Buffer.from(contractId)),
  //                   'update-mode': bufferCV(Buffer.from('dynamic')),
  //                 }),
  //               })
  //             ),
  //           },
  //         })
  //         .build()
  //     );
  //     // Set updated_at for testing.
  //     await db.sql`
  //       UPDATE tokens
  //       SET updated_at = NOW() - INTERVAL '2 days'
  //       WHERE id = 1
  //     `;
  //     await markAllJobsAsDone(db);

  //     await db.chainhook.processPayload(
  //       new TestChainhookPayloadBuilder()
  //         .apply()
  //         .block({ height: 95 })
  //         .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
  //         .event({
  //           type: 'SmartContractEvent',
  //           position: { index: 0 },
  //           data: {
  //             contract_identifier: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
  //             topic: 'print',
  //             raw_value: cvToHex(stringUtf8CV('test')),
  //           },
  //         })
  //         .build()
  //     );

  //     const job = await db.getJob({ id: 2 });
  //     expect(job?.status).toBe('pending');
  //   });

  //   test('enqueues dynamic tokens for refresh with ttl', async () => {
  //     const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
  //     const contractId = `${address}.friedger-pool-nft`;
  //     ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 99999;
  //     await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
  //     // Mark as dynamic
  //     await db.chainhook.processPayload(
  //       new TestChainhookPayloadBuilder()
  //         .apply()
  //         .block({ height: 90 })
  //         .transaction({ hash: '0x01', sender: address })
  //         .event({
  //           type: 'SmartContractEvent',
  //           position: { index: 0 },
  //           data: {
  //             contract_identifier: contractId,
  //             topic: 'print',
  //             raw_value: cvToHex(
  //               tupleCV({
  //                 notification: bufferCV(Buffer.from('token-metadata-update')),
  //                 payload: tupleCV({
  //                   'token-class': bufferCV(Buffer.from('nft')),
  //                   'contract-id': bufferCV(Buffer.from(contractId)),
  //                   'update-mode': bufferCV(Buffer.from('dynamic')),
  //                   ttl: uintCV(3600),
  //                 }),
  //               })
  //             ),
  //           },
  //         })
  //         .build()
  //     );
  //     // Set updated_at for testing
  //     await db.sql`
  //       UPDATE tokens
  //       SET updated_at = NOW() - INTERVAL '2 hours'
  //       WHERE id = 1
  //     `;
  //     await markAllJobsAsDone(db);

  //     await db.chainhook.processPayload(
  //       new TestChainhookPayloadBuilder()
  //         .apply()
  //         .block({ height: 95 })
  //         .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
  //         .event({
  //           type: 'SmartContractEvent',
  //           position: { index: 0 },
  //           data: {
  //             contract_identifier: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
  //             topic: 'print',
  //             raw_value: cvToHex(stringUtf8CV('test')),
  //           },
  //         })
  //         .build()
  //     );

  //     const job = await db.getJob({ id: 2 });
  //     expect(job?.status).toBe('pending');
  //   });
  // });
});
