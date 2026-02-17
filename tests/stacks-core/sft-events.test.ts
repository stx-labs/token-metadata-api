import { cvToHex, tupleCV, bufferCV, uintCV } from '@stacks/transactions';
import { DbSipNumber, DbTokenType } from '../../src/pg/types';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContract,
  TestTransactionBuilder,
  TestBlockBuilder,
  markAllJobsAsDone,
} from '../helpers';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor';

describe('sft events', () => {
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

  test('SFT mint enqueues minted token for valid contract', async () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = `${address}.key-alex-autoalex-v1`;
    await insertAndEnqueueTestContract(db, contractId, DbSipNumber.sip013);
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
                  type: bufferCV(Buffer.from('sft_mint')),
                  recipient: bufferCV(Buffer.from(address)),
                  'token-id': uintCV(3),
                  amount: uintCV(1000),
                })
              )
            )
            // Try a duplicate of the same token but different amount
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  type: bufferCV(Buffer.from('sft_mint')),
                  recipient: bufferCV(Buffer.from(address)),
                  'token-id': uintCV(3),
                  amount: uintCV(200),
                })
              )
            )
            .build()
        )
        .build()
    );

    const token = await db.getToken({ id: 1 });
    expect(token?.type).toBe(DbTokenType.sft);
    expect(token?.token_number).toBe('3');
    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].token_id).toBe(1);
  });
});
