import { strict as assert } from 'node:assert';
import { cvToHex, tupleCV, bufferCV, uintCV, stringUtf8CV } from '@stacks/transactions';
import { DbSipNumber } from '../../src/pg/types.js';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env.js';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store.js';
import {
  insertAndEnqueueTestContractWithTokens,
  markAllJobsAsDone,
  TestTransactionBuilder,
  TestBlockBuilder,
  setupEnv,
} from '../helpers.js';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor.js';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('block processor', () => {
  let db: PgStore;
  let processor: StacksCoreBlockProcessor;

  beforeEach(async () => {
    setupEnv();
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
    processor = new StacksCoreBlockProcessor({ db: db.core });
  });

  afterEach(async () => {
    await db.close();
  });

  describe('chain tip', () => {
    test('updates chain tip on stacks core block', async () => {
      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 100,
          index_block_hash: '0x000001',
          parent_index_block_hash: '0x000000',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
            }).build()
          )
          .build()
      );
      assert.deepStrictEqual(await db.core.getChainTip(db.sql), {
        index_block_hash: '0x000001',
        block_height: 100,
        canonical: true,
        parent_index_block_hash: '0x000000',
      });

      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 101,
          index_block_hash: '0x000002',
          parent_index_block_hash: '0x000001',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
            }).build()
          )
          .build()
      );
      assert.deepStrictEqual(await db.core.getChainTip(db.sql), {
        index_block_hash: '0x000002',
        block_height: 101,
        canonical: true,
        parent_index_block_hash: '0x000001',
      });
    });

    test('enqueues dynamic tokens for refresh with standard interval', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;
      ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 86400;
      await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
      // Mark as dynamic
      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 2,
          index_block_hash: '0x000002',
          parent_index_block_hash: '0x000001',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: address,
            })
              .addContractEvent(
                contractId,
                cvToHex(
                  tupleCV({
                    notification: bufferCV(Buffer.from('token-metadata-update')),
                    payload: tupleCV({
                      'token-class': bufferCV(Buffer.from('nft')),
                      'contract-id': bufferCV(Buffer.from(contractId)),
                      'update-mode': bufferCV(Buffer.from('dynamic')),
                    }),
                  })
                )
              )
              .build()
          )
          .build()
      );
      // Set updated_at for testing.
      await db.sql`
        UPDATE tokens
        SET updated_at = NOW() - INTERVAL '2 days'
        WHERE id = 1
      `;
      await markAllJobsAsDone(db);

      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 3,
          index_block_hash: '0x000003',
          parent_index_block_hash: '0x000002',
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

      const job = await db.getJob({ id: 2 });
      assert.strictEqual(job?.status, 'pending');
    });

    test('enqueues dynamic tokens for refresh with ttl', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;
      ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 99999;
      await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
      // Mark as dynamic
      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 2,
          index_block_hash: '0x000002',
          parent_index_block_hash: '0x000001',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: address,
            })
              .addContractEvent(
                contractId,
                cvToHex(
                  tupleCV({
                    notification: bufferCV(Buffer.from('token-metadata-update')),
                    payload: tupleCV({
                      'token-class': bufferCV(Buffer.from('nft')),
                      'contract-id': bufferCV(Buffer.from(contractId)),
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
      // Set updated_at for testing
      await db.sql`
        UPDATE tokens
        SET updated_at = NOW() - INTERVAL '2 hours'
        WHERE id = 1
      `;
      await markAllJobsAsDone(db);

      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 3,
          index_block_hash: '0x000003',
          parent_index_block_hash: '0x000002',
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

      const job = await db.getJob({ id: 2 });
      assert.strictEqual(job?.status, 'pending');
    });
  });
});
