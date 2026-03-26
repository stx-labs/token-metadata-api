import { strict as assert } from 'node:assert';
import { DbSipNumber } from '../../src/pg/types.js';
import { cycleMigrations } from '@stacks/api-toolkit';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store.js';
import { SIP_009_ABI, TestTransactionBuilder, TestBlockBuilder, setupEnv } from '../helpers.js';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor.js';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('contract deployments', () => {
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

  test('enqueues valid token contract', async () => {
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
            .setSmartContractPayload('friedger-pool-nft', SIP_009_ABI)
            .build()
        )
        .build()
    );
    const dbContract = await db.getSmartContract({ id: 1 });
    assert.strictEqual(dbContract?.sip, DbSipNumber.sip009);
    assert.strictEqual(
      dbContract?.principal,
      'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft'
    );
    assert.strictEqual((await db.getPendingJobBatch({ limit: 1 })).length, 1);
  });

  test('ignores token contract from a failed transaction', async () => {
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
            status: 'abort_by_post_condition', // Failed
          })
            .setSmartContractPayload(
              'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
              SIP_009_ABI
            )
            .build()
        )
        .build()
    );
    assert.strictEqual(await db.getSmartContract({ id: 1 }), undefined);
    assert.strictEqual((await db.getPendingJobBatch({ limit: 1 })).length, 0);
  });

  test('ignores non-token contract', async () => {
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
            .setSmartContractPayload(
              'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
              {
                maps: [],
                functions: [],
                variables: [],
                fungible_tokens: [],
                non_fungible_tokens: [],
              }
            )
            .build()
        )
        .build()
    );
    assert.strictEqual(await db.getSmartContract({ id: 1 }), undefined);
    assert.strictEqual((await db.getPendingJobBatch({ limit: 1 })).length, 0);
  });
});
