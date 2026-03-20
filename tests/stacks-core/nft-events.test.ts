import { strict as assert } from 'node:assert';
import { cvToHex, uintCV } from '@stacks/transactions';
import { DbSipNumber } from '../../src/pg/types';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContractWithTokens,
  markAllJobsAsDone,
  TestTransactionBuilder,
  TestBlockBuilder,
  SIP_009_ABI,
} from '../helpers';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('nft events', () => {
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

  test('NFT mint enqueues metadata fetch', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
    await markAllJobsAsDone(db);

    // Get 4th token via mint
    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addNftMintEvent(`${contractId}::friedger-nft`, address, cvToHex(uintCV(4)))
            .build()
        )
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].token_id, 4);
    assert.notStrictEqual(await db.getToken({ id: 4 }), undefined);
  });

  test('NFT contract can start with zero tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractName = 'friedger-pool-nft';
    const contractId = `${address}.${contractName}`;
    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .setSmartContractPayload(contractName, SIP_009_ABI)
            .build()
        )
        .build()
    );
    await db.core.updateSmartContractTokenCount({ id: 1, count: 0n });
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 3,
        index_block_hash: '0x000003',
        parent_index_block_hash: '0x000002',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addNftMintEvent(`${contractId}::crashpunks-v2`, address, cvToHex(uintCV(1)))
            .build()
        )
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].token_id, 1);
    assert.notStrictEqual(await db.getToken({ id: 1 }), undefined);
  });

  test('NFT mint is ignored if contract does not exist', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addNftMintEvent(`${contractId}::crashpunks-v2`, address, cvToHex(uintCV(1)))
            .build()
        )
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    assert.strictEqual(jobs.length, 0);
    assert.strictEqual(await db.getToken({ id: 1 }), undefined);
  });
});
