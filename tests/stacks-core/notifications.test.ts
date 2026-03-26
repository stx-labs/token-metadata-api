import { strict as assert } from 'node:assert';
import { cvToHex, tupleCV, bufferCV, listCV, uintCV, stringUtf8CV } from '@stacks/transactions';
import { DbSipNumber } from '../../src/pg/types.js';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env.js';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store.js';
import {
  getLatestContractTokenNotifications,
  getLatestTokenNotification,
  insertAndEnqueueTestContractWithTokens,
  markAllJobsAsDone,
  TestTransactionBuilder,
  TestBlockBuilder,
} from '../helpers.js';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor.js';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('token metadata notifications', () => {
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

  test('enqueues notification for all tokens in contract', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    assert.strictEqual((await db.getPendingJobBatch({ limit: 10 })).length, 3);
    const notifs = await getLatestContractTokenNotifications(db, contractId);
    assert.strictEqual(notifs.length, 3);
    assert.strictEqual(notifs[0].token_id, 1);
    assert.strictEqual(notifs[0].update_mode, 'standard');
    assert.strictEqual(notifs[0].block_height, 2);
  });

  test('enqueues notification for specific tokens in contract', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1), uintCV(2)]),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 10 });
    assert.strictEqual(jobs.length, 2); // Only two tokens
    assert.strictEqual(jobs[0].token_id, 1);
    assert.notStrictEqual(await getLatestTokenNotification(db, 1), undefined);
    assert.strictEqual(jobs[1].token_id, 2);
    assert.notStrictEqual(await getLatestTokenNotification(db, 2), undefined);
    assert.strictEqual(await getLatestTokenNotification(db, 3), undefined);
  });

  test('updates token refresh mode', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                    'update-mode': stringUtf8CV('frozen'), // Mark as frozen.
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const notif = await getLatestTokenNotification(db, 1);
    assert.strictEqual(notif?.update_mode, 'frozen');
  });

  test('ignores notification for frozen tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    // Mark as frozen
    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                    'update-mode': bufferCV(Buffer.from('frozen')),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 3,
        index_block_hash: '0x000003',
        parent_index_block_hash: '0x000002',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const jobs2 = await db.getPendingJobBatch({ limit: 10 });
    assert.strictEqual(jobs2.length, 0); // No tokens queued.
    const notif = await getLatestTokenNotification(db, 1);
    assert.notStrictEqual(notif, undefined);
    assert.strictEqual(notif?.block_height, 2);
    assert.strictEqual(notif?.update_mode, 'frozen'); // Keeps the old frozen notif
  });

  test('second token notification replaces previous', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                    'update-mode': bufferCV(Buffer.from('dynamic')),
                    ttl: uintCV(3600),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );
    await markAllJobsAsDone(db);
    const notif1 = await getLatestTokenNotification(db, 1);
    assert.notStrictEqual(notif1, undefined);
    assert.strictEqual(notif1?.block_height, 2);
    assert.strictEqual(notif1?.update_mode, 'dynamic');
    assert.strictEqual(notif1?.ttl, '3600');

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 3,
        index_block_hash: '0x000003',
        parent_index_block_hash: '0x000002',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const notif2 = await getLatestTokenNotification(db, 1);
    assert.notStrictEqual(notif2, undefined);
    assert.strictEqual(notif2?.block_height, 3);
    assert.strictEqual(notif2?.update_mode, 'standard');
    assert.strictEqual(notif2?.ttl, null);
  });

  test('contract notification replaces token notification', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );
    await markAllJobsAsDone(db);
    const notif1 = await getLatestTokenNotification(db, 1);
    assert.notStrictEqual(notif1, undefined);
    assert.strictEqual(notif1?.block_height, 2);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 3,
        index_block_hash: '0x000003',
        parent_index_block_hash: '0x000002',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const notif2 = await getLatestTokenNotification(db, 1);
    assert.notStrictEqual(notif2, undefined);
    assert.strictEqual(notif2?.block_height, 3);
  });

  test('ignores other contract log events', async () => {
    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({
            tx_id: '0x01',
            sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
          })
            .addContractEvent(
              'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
              cvToHex(stringUtf8CV('test'))
            )
            .build()
        )
        .build()
    );
    assert.strictEqual((await db.getPendingJobBatch({ limit: 1 })).length, 0);
  });

  test('ignores notification from incorrect sender', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({
            tx_id: '0x01',
            // Incorrect sender
            sender: 'SP29BPZ6BD5D8509Y9VP70J0V7VKKDDFCRPHA0T6A',
          })
            .addContractEvent(
              'SP29BPZ6BD5D8509Y9VP70J0V7VKKDDFCRPHA0T6A.another-contract',
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    assert.strictEqual((await db.getPendingJobBatch({ limit: 1 })).length, 0);
  });
});
