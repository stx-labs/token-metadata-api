import { cvToHex, uintCV } from '@stacks/transactions';
import { DbSipNumber } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
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

describe('NFT events', () => {
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
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addNftMintEvent(`${contractId}::friedger-nft`, address, cvToHex(uintCV(4)))
            .build()
        )
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].token_id).toBe(4);
    await expect(db.getToken({ id: 4 })).resolves.not.toBeUndefined();
  });

  test('NFT contract can start with zero tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractName = 'friedger-pool-nft';
    const contractId = `${address}.${contractName}`;
    await processor.processBlock(
      new TestBlockBuilder({ block_height: 90 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .setSmartContractPayload(contractName, SIP_009_ABI)
            .build()
        )
        .build()
    );
    await db.updateSmartContractTokenCount({ id: 1, count: 0n });
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addNftMintEvent(`${contractId}::crashpunks-v2`, address, cvToHex(uintCV(1)))
            .build()
        )
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].token_id).toBe(1);
    await expect(db.getToken({ id: 1 })).resolves.not.toBeUndefined();
  });

  test('NFT mint is ignored if contract does not exist', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addNftMintEvent(`${contractId}::crashpunks-v2`, address, cvToHex(uintCV(1)))
            .build()
        )
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs).toHaveLength(0);
    await expect(db.getToken({ id: 1 })).resolves.toBeUndefined();
  });
});
