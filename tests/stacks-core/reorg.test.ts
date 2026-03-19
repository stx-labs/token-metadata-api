import { strict as assert } from 'node:assert';
import { cvToHex, tupleCV, bufferCV, uintCV } from '@stacks/transactions';
import { DbSipNumber } from '../../src/pg/types';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  TestTransactionBuilder,
  TestBlockBuilder,
  SIP_009_ABI,
  SIP_010_ABI,
  markAllJobsAsDone,
} from '../helpers';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor';
import { after, before, describe, test } from 'node:test';

describe('re-org handling', () => {
  let db: PgStore;
  let processor: StacksCoreBlockProcessor;

  const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
  const ftContractId = `${address}.test-ft`;
  const nftContractId = `${address}.test-nft`;

  before(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
    processor = new StacksCoreBlockProcessor({ db: db.core });

    // Helper to build blocks with specific height and hash
    const buildBlock = (height: number) => {
      const hex = height.toString(16).padStart(2, '0');
      return new TestBlockBuilder({
        block_height: height,
        index_block_hash: `0x0000${hex}`,
        parent_index_block_hash: `0x0000${(height - 1).toString(16).padStart(2, '0')}`,
      });
    };

    // Process 30 blocks with various token operations spread across them
    for (let i = 1; i <= 30; i++) {
      const hex = i.toString(16).padStart(2, '0');
      const builder = buildBlock(i);
      const txBuilder = new TestTransactionBuilder({
        tx_id: `0x01${hex}`,
        sender: address,
      });

      // Block 5: Deploy FT contract
      if (i === 5) {
        txBuilder.setSmartContractPayload('test-ft', SIP_010_ABI);
      }

      // Block 10: Deploy NFT contract
      if (i === 10) {
        txBuilder.setSmartContractPayload('test-nft', SIP_009_ABI);
      }

      // Block 12: First FT mint (1000 tokens) - will survive reorg
      if (i === 12) {
        txBuilder.addFtMintEvent(`${ftContractId}::newyorkcitycoin`, address, '1000');
      }

      // Block 15: Second FT mint (500 tokens) - will survive reorg
      if (i === 15) {
        txBuilder.addFtMintEvent(`${ftContractId}::newyorkcitycoin`, address, '500');
      }

      // Block 18: NFT mint (token #1) - will survive reorg
      if (i === 18) {
        txBuilder.addNftMintEvent(`${nftContractId}::crashpunks-v2`, address, cvToHex(uintCV(1)));
      }

      // Block 20: FT burn (200 tokens) - will survive reorg
      if (i === 20) {
        txBuilder.addFtBurnEvent(`${ftContractId}::newyorkcitycoin`, address, '200');
      }

      // Block 22: NFT mint (token #2) - will survive reorg
      if (i === 22) {
        txBuilder.addNftMintEvent(`${nftContractId}::crashpunks-v2`, address, cvToHex(uintCV(2)));
      }

      // Block 24: Notification marking NFT as dynamic - will survive reorg
      if (i === 24) {
        txBuilder.addContractEvent(
          nftContractId,
          cvToHex(
            tupleCV({
              notification: bufferCV(Buffer.from('token-metadata-update')),
              payload: tupleCV({
                'token-class': bufferCV(Buffer.from('nft')),
                'contract-id': bufferCV(Buffer.from(nftContractId)),
                'update-mode': bufferCV(Buffer.from('dynamic')),
              }),
            })
          )
        );
      }

      // Block 26: FT mint (3000 tokens) - WILL BE REVERTED
      if (i === 26) {
        txBuilder.addFtMintEvent(`${ftContractId}::newyorkcitycoin`, address, '3000');
      }

      // Block 27: NFT mint (token #3) - WILL BE REVERTED
      if (i === 27) {
        txBuilder.addNftMintEvent(`${nftContractId}::crashpunks-v2`, address, cvToHex(uintCV(3)));
      }

      // Block 28: FT burn (100 tokens) - WILL BE REVERTED
      if (i === 28) {
        txBuilder.addFtBurnEvent(`${ftContractId}::newyorkcitycoin`, address, '100');
      }

      // Block 29: Notification marking NFT as frozen - WILL BE REVERTED
      if (i === 29) {
        txBuilder.addContractEvent(
          nftContractId,
          cvToHex(
            tupleCV({
              notification: bufferCV(Buffer.from('token-metadata-update')),
              payload: tupleCV({
                'token-class': bufferCV(Buffer.from('nft')),
                'contract-id': bufferCV(Buffer.from(nftContractId)),
                'update-mode': bufferCV(Buffer.from('frozen')),
              }),
            })
          )
        );
      }

      // Block 30: Another FT mint (500 tokens) - WILL BE REVERTED
      if (i === 30) {
        txBuilder.addFtMintEvent(`${ftContractId}::newyorkcitycoin`, address, '500');
      }

      builder.addTransaction(txBuilder.build());
      await processor.processBlock(builder.build());

      // After block 5: Initialize FT token with 0 supply
      // FT contracts need their token record created before supply deltas can be tracked
      if (i === 5) {
        const ftContract = await db.getSmartContract({ principal: ftContractId });
        assert.notStrictEqual(ftContract, undefined);
        if (ftContract) {
          await db.core.insertAndEnqueueSequentialTokens(db.sql, {
            smart_contract: ftContract,
            token_count: 1n,
          });
          // Initialize total_supply to 0 so supply deltas work correctly
          await db.sql`UPDATE tokens SET total_supply = 0 WHERE smart_contract_id = ${ftContract.id}`;
        }
      }
    }

    // Verify state before reorg
    assert.deepStrictEqual(await db.core.getChainTip(db.sql), {
      index_block_hash: '0x00001e', // Block 30
      block_height: 30,
      canonical: true,
      parent_index_block_hash: '0x00001d',
    });

    // Verify FT contract exists
    const ftContract = await db.getSmartContract({ principal: ftContractId });
    assert.notStrictEqual(ftContract, undefined);
    assert.strictEqual(ftContract?.sip, DbSipNumber.sip010);

    // Verify NFT contract exists
    const nftContract = await db.getSmartContract({ principal: nftContractId });
    assert.notStrictEqual(nftContract, undefined);
    assert.strictEqual(nftContract?.sip, DbSipNumber.sip009);

    // Verify NFT tokens exist (3 tokens: #1, #2, #3)
    const nftToken1 = await db.getToken({ id: 2 });
    const nftToken2 = await db.getToken({ id: 3 });
    const nftToken3 = await db.getToken({ id: 4 });
    assert.notStrictEqual(nftToken1, undefined);
    assert.notStrictEqual(nftToken2, undefined);
    assert.notStrictEqual(nftToken3, undefined);

    // Verify notifications exist
    // Block 24: dynamic notification applied to 2 existing NFT tokens (tokens #1, #2)
    // Block 29: frozen notification applied to 3 NFT tokens (tokens #1, #2, #3)
    const notificationsBefore = await db.sql`
      SELECT * FROM update_notifications WHERE canonical = true ORDER BY block_height
    `;
    assert.strictEqual(notificationsBefore.length, 5); // 2 (block 24) + 3 (block 29)

    // Verify jobs exist for all NFT tokens (including token #3 which will be reverted) Jobs: FT
    // contract job, NFT contract job, FT token job, NFT token #1 job, NFT token #2 job, NFT token
    // #3 job, FT token supply job
    const jobsBefore = await db.sql<{ id: number; token_id: number | null }[]>`
      SELECT id, token_id FROM jobs ORDER BY id
    `;
    assert.strictEqual(jobsBefore.length, 7);
    // Verify job for NFT token #3 exists (token_id = 4)
    const nftToken3JobBefore = jobsBefore.find(j => j.token_id === 4);
    assert.notStrictEqual(nftToken3JobBefore, undefined);
  });

  after(async () => {
    await db.close();
  });

  test('reverts to last valid chain tip with token contracts, mints, burns and notifications', async () => {
    // Now trigger a reorg: new block 26 with parent pointing to block 25
    // This will invalidate blocks 26-30
    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 26,
        index_block_hash: '0x0000ff', // Different hash for new fork
        parent_index_block_hash: '0x000019', // Parent is block 25
      })
        .addTransaction(
          new TestTransactionBuilder({
            tx_id: '0x0200',
            sender: address,
          }).build()
        )
        .build()
    );

    // Verify chain tip is now at the new block 26
    assert.deepStrictEqual(await db.core.getChainTip(db.sql), {
      index_block_hash: '0x0000ff',
      block_height: 26,
      canonical: true,
      parent_index_block_hash: '0x000019',
    });

    // Verify contracts still exist (deployed before reorg point)
    const ftContractAfter = await db.getSmartContract({ principal: ftContractId });
    assert.notStrictEqual(ftContractAfter, undefined);

    const nftContractAfter = await db.getSmartContract({ principal: nftContractId });
    assert.notStrictEqual(nftContractAfter, undefined);

    // Verify NFT token #3 (minted at block 27) is reverted
    const nftToken1After = await db.getToken({ id: 2 });
    const nftToken2After = await db.getToken({ id: 3 });
    const nftToken3After = await db.getToken({ id: 4 });
    assert.notStrictEqual(nftToken1After, undefined); // Still exists (block 18)
    assert.notStrictEqual(nftToken2After, undefined); // Still exists (block 22)
    assert.strictEqual(nftToken3After, undefined); // Reverted (block 27)

    // Verify notifications: frozen notification at block 29 should be reverted
    // Only dynamic notification at block 24 should remain
    const notificationsAfter = await db.sql`
      SELECT * FROM update_notifications WHERE canonical = true ORDER BY block_height
    `;
    assert.strictEqual(notificationsAfter.length, 2); // Only dynamic notification (x 2 tokens)
    for (const notification of notificationsAfter) {
      assert.strictEqual(notification.update_mode, 'dynamic');
      assert.strictEqual(notification.block_height, 24);
    }

    // Verify blocks 26-30 are non-canonical
    const blocksAfter = await db.sql<{ block_height: number }[]>`
      SELECT block_height FROM blocks WHERE canonical = true ORDER BY block_height
    `;
    assert.strictEqual(blocksAfter.length, 26); // Blocks 1-25 + new block 26
    const maxBlockHeight = Math.max(...blocksAfter.map(b => b.block_height));
    assert.strictEqual(maxBlockHeight, 26);
  });

  test('continues previous canonical chain segment', async () => {
    // All old jobs are marked as done
    await markAllJobsAsDone(db);

    // Trigger a new reorg: new block 31 with parent pointing to old chain tip block 30
    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 31,
        index_block_hash: '0x00001f', // Different hash for new fork
        parent_index_block_hash: '0x00001e', // Parent is block 30
      })
        .addTransaction(
          new TestTransactionBuilder({
            tx_id: '0x0300',
            sender: address,
          }).build()
        )
        .build()
    );

    // Verify chain tip is now at the new block 31
    assert.deepStrictEqual(await db.core.getChainTip(db.sql), {
      index_block_hash: '0x00001f',
      block_height: 31,
      canonical: true,
      parent_index_block_hash: '0x00001e',
    });

    // Verify FT contract exists
    const ftContract = await db.getSmartContract({ principal: ftContractId });
    assert.notStrictEqual(ftContract, undefined);
    assert.strictEqual(ftContract?.sip, DbSipNumber.sip010);

    // Verify NFT contract exists
    const nftContract = await db.getSmartContract({ principal: nftContractId });
    assert.notStrictEqual(nftContract, undefined);
    assert.strictEqual(nftContract?.sip, DbSipNumber.sip009);

    // Verify NFT tokens exist (3 tokens: #1, #2, #3)
    const nftToken1 = await db.getToken({ id: 2 });
    const nftToken2 = await db.getToken({ id: 3 });
    const nftToken3 = await db.getToken({ id: 4 });
    assert.notStrictEqual(nftToken1, undefined);
    assert.notStrictEqual(nftToken2, undefined);
    assert.notStrictEqual(nftToken3, undefined);

    // Verify notifications exist
    // Block 24: dynamic notification applied to 2 existing NFT tokens (tokens #1, #2)
    // Block 29: frozen notification applied to 3 NFT tokens (tokens #1, #2, #3)
    const notificationsBefore = await db.sql`
      SELECT * FROM update_notifications WHERE canonical = true ORDER BY block_height
    `;
    assert.strictEqual(notificationsBefore.length, 5); // 2 (block 24) + 3 (block 29)

    // Jobs for NFT #3 and FT supply should be re-enqueued.
    const jobsAfter = await db.getPendingJobBatch({ limit: 10 });
    assert.strictEqual(jobsAfter.length, 2);
    assert.notStrictEqual(
      jobsAfter.find(j => j.token_id === 4),
      undefined
    );
    assert.notStrictEqual(
      jobsAfter.find(j => j.token_supply_id === 1),
      undefined
    );
  });
});
