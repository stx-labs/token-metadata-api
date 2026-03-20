import { strict as assert } from 'node:assert';
import { DbProcessedTokenUpdateBundle, DbSipNumber } from '../../src/pg/types';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContractWithTokens,
  markAllJobsAsDone,
  TestTransactionBuilder,
  TestBlockBuilder,
} from '../helpers';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('ft events', () => {
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

  test('FT mints enqueue token supply update', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.usdc`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip010, 1n);
    await markAllJobsAsDone(db);
    const tokenValues: DbProcessedTokenUpdateBundle = {
      token: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 8,
        total_supply: '10000',
        uri: null,
      },
    };
    await db.core.updateProcessedTokenWithMetadata({ id: 1, values: tokenValues });
    let jobs = await db.getPendingJobBatch({ limit: 1 });
    assert.strictEqual(jobs.length, 0);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addFtMintEvent(`${contractId}::usdc`, address, '2000')
            .build()
        )
        .build()
    );

    jobs = await db.getPendingJobBatch({ limit: 1 });
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].smart_contract_id, null);
    assert.strictEqual(jobs[0].token_id, null);
    assert.strictEqual(jobs[0].token_supply_id, 1);
  });

  test('FT burns enqueue token supply update', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.usdc`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip010, 1n);
    await markAllJobsAsDone(db);
    const tokenValues: DbProcessedTokenUpdateBundle = {
      token: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 8,
        total_supply: '10000',
        uri: null,
      },
    };
    await db.core.updateProcessedTokenWithMetadata({ id: 1, values: tokenValues });
    let jobs = await db.getPendingJobBatch({ limit: 1 });
    assert.strictEqual(jobs.length, 0);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addFtBurnEvent(`${contractId}::usdc`, address, '2000')
            .build()
        )
        .build()
    );

    jobs = await db.getPendingJobBatch({ limit: 1 });
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].smart_contract_id, null);
    assert.strictEqual(jobs[0].token_id, null);
    assert.strictEqual(jobs[0].token_supply_id, 1);
  });
});
