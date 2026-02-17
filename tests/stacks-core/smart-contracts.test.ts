import { DbSipNumber, DbSmartContract } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import { SIP_009_ABI, TestTransactionBuilder, TestBlockBuilder } from '../helpers';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor';

describe('contract deployments', () => {
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
    expect(dbContract?.sip).toBe(DbSipNumber.sip009);
    expect(dbContract?.principal).toBe(
      'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft'
    );
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(1);
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
    await expect(db.getSmartContract({ id: 1 })).resolves.toBeUndefined();
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
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
    await expect(db.getSmartContract({ id: 1 })).resolves.toBeUndefined();
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
  });
});
