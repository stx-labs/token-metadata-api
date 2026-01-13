import { DbProcessedTokenUpdateBundle, DbSipNumber, DbToken } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContractWithTokens,
  getTokenCount,
  markAllJobsAsDone,
  TestTransactionBuilder,
  TestBlockBuilder,
} from '../helpers';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor';

describe('FT events', () => {
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

  test('FT mints adjust token supply', async () => {
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
    await db.updateProcessedTokenWithMetadata({ id: 1, values: tokenValues });
    let token = await db.getToken({ id: 1 });
    expect(token?.total_supply).toBe('10000');

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addFtMintEvent(`${contractId}::usdc`, address, '2000')
            .build()
        )
        .build()
    );

    token = await db.getToken({ id: 1 });
    expect(token?.total_supply).toBe('12000');
  });

  test('FT mints do not enqueue refresh', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.usdc`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip010, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addFtMintEvent(`${contractId}::usdc`, address, '2000')
            .build()
        )
        .build()
    );

    await expect(getTokenCount(db)).resolves.toBe('1');
    // No refresh necessary, we'll only adjust the supply.
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
  });

  test('FT burns adjust token supply', async () => {
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
    await db.updateProcessedTokenWithMetadata({ id: 1, values: tokenValues });
    let token = await db.getToken({ id: 1 });
    expect(token?.total_supply).toBe('10000');

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addFtBurnEvent(`${contractId}::usdc`, address, '2000')
            .build()
        )
        .build()
    );

    token = await db.getToken({ id: 1 });
    expect(token?.total_supply).toBe('8000');
  });

  test('FT burns do not enqueue refresh', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.usdc`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip010, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addFtBurnEvent(`${contractId}::usdc`, address, '2000')
            .build()
        )
        .build()
    );

    await expect(getTokenCount(db)).resolves.toBe('1');
    // No refresh necessary, we'll only adjust the supply.
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
  });
});
