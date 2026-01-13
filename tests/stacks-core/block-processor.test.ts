import { cvToHex, tupleCV, bufferCV, uintCV, stringUtf8CV } from '@stacks/transactions';
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
  SIP_010_ABI,
} from '../helpers';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor';

describe('Block processor', () => {
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

  describe('chain tip', () => {
    test('updates chain tip on chainhook event', async () => {
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
      await expect(db.core.getChainTip(db.sql)).resolves.toStrictEqual({
        index_block_hash: '0x000001',
        block_height: 100,
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
      await expect(db.core.getChainTip(db.sql)).resolves.toStrictEqual({
        index_block_hash: '0x000002',
        block_height: 101,
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
          block_height: 90,
          index_block_hash: '0x000003',
          parent_index_block_hash: '0x000002',
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
          block_height: 95,
          index_block_hash: '0x000004',
          parent_index_block_hash: '0x000003',
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
      expect(job?.status).toBe('pending');
    });

    test('enqueues dynamic tokens for refresh with ttl', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;
      ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 99999;
      await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
      // Mark as dynamic
      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 90,
          index_block_hash: '0x000003',
          parent_index_block_hash: '0x000002',
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
          block_height: 95,
          index_block_hash: '0x000004',
          parent_index_block_hash: '0x000003',
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
      expect(job?.status).toBe('pending');
    });
  });

  describe('reorg handling', () => {
    test('reverts to last valid chain tip with token contracts, mints, burns and notifications', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const ftContractId = `${address}.test-ft`;
      const nftContractId = `${address}.test-nft`;

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
          expect(ftContract).not.toBeUndefined();
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
      await expect(db.core.getChainTip(db.sql)).resolves.toStrictEqual({
        index_block_hash: '0x00001e', // Block 30
        block_height: 30,
      });

      // Verify FT contract exists
      const ftContract = await db.getSmartContract({ principal: ftContractId });
      expect(ftContract).not.toBeUndefined();
      expect(ftContract?.sip).toBe(DbSipNumber.sip010);

      // Verify NFT contract exists
      const nftContract = await db.getSmartContract({ principal: nftContractId });
      expect(nftContract).not.toBeUndefined();
      expect(nftContract?.sip).toBe(DbSipNumber.sip009);

      // Verify FT token supply: 1000 + 500 - 200 + 3000 - 100 + 500 = 4700
      const ftToken = await db.getToken({ id: 1 });
      expect(ftToken?.total_supply).toBe('4700');

      // Verify NFT tokens exist (3 tokens: #1, #2, #3)
      const nftToken1 = await db.getToken({ id: 2 });
      const nftToken2 = await db.getToken({ id: 3 });
      const nftToken3 = await db.getToken({ id: 4 });
      expect(nftToken1).not.toBeUndefined();
      expect(nftToken2).not.toBeUndefined();
      expect(nftToken3).not.toBeUndefined();

      // Verify notifications exist
      // Block 24: dynamic notification applied to 2 existing NFT tokens (tokens #1, #2)
      // Block 29: frozen notification applied to 3 NFT tokens (tokens #1, #2, #3)
      const notificationsBefore = await db.sql`
        SELECT * FROM update_notifications ORDER BY block_height
      `;
      expect(notificationsBefore.length).toBe(5); // 2 (block 24) + 3 (block 29)

      // Verify jobs exist for all NFT tokens (including token #3 which will be reverted)
      // Jobs: FT contract job, NFT contract job, FT token job, NFT token #1 job, NFT token #2 job, NFT token #3 job
      const jobsBefore = await db.sql<{ id: number; token_id: number | null }[]>`
        SELECT id, token_id FROM jobs ORDER BY id
      `;
      expect(jobsBefore.length).toBe(6);
      // Verify job for NFT token #3 exists (token_id = 4)
      const nftToken3JobBefore = jobsBefore.find(j => j.token_id === 4);
      expect(nftToken3JobBefore).not.toBeUndefined();

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
      await expect(db.core.getChainTip(db.sql)).resolves.toStrictEqual({
        index_block_hash: '0x0000ff',
        block_height: 26,
      });

      // Verify contracts still exist (deployed before reorg point)
      const ftContractAfter = await db.getSmartContract({ principal: ftContractId });
      expect(ftContractAfter).not.toBeUndefined();

      const nftContractAfter = await db.getSmartContract({ principal: nftContractId });
      expect(nftContractAfter).not.toBeUndefined();

      // Verify FT token supply is reverted: 1000 + 500 - 200 = 1300
      // The mints at blocks 26, 30 (+3000, +500) and burn at block 28 (-100) are reverted
      const ftTokenAfter = await db.getToken({ id: 1 });
      expect(ftTokenAfter?.total_supply).toBe('1300');

      // Verify NFT token #3 (minted at block 27) is reverted
      const nftToken1After = await db.getToken({ id: 2 });
      const nftToken2After = await db.getToken({ id: 3 });
      const nftToken3After = await db.getToken({ id: 4 });
      expect(nftToken1After).not.toBeUndefined(); // Still exists (block 18)
      expect(nftToken2After).not.toBeUndefined(); // Still exists (block 22)
      expect(nftToken3After).toBeUndefined(); // Reverted (block 27)

      // Verify notifications: frozen notification at block 29 should be reverted
      // Only dynamic notification at block 24 should remain
      const notificationsAfter = await db.sql`
        SELECT * FROM update_notifications ORDER BY block_height
      `;
      expect(notificationsAfter.length).toBe(2); // Only dynamic notification (x 2 tokens)
      for (const notification of notificationsAfter) {
        expect(notification.update_mode).toBe('dynamic');
        expect(notification.block_height).toBe(24);
      }

      // Verify blocks 26-30 are deleted
      const blocksAfter = await db.sql<{ block_height: number }[]>`
        SELECT block_height FROM blocks ORDER BY block_height
      `;
      expect(blocksAfter.length).toBe(26); // Blocks 1-25 + new block 26
      const maxBlockHeight = Math.max(...blocksAfter.map(b => b.block_height));
      expect(maxBlockHeight).toBe(26);

      // Verify job for NFT token #3 was deleted (cascade delete via token deletion)
      // Jobs remaining: FT contract job, NFT contract job, FT token job, NFT token #1 job, NFT token #2 job
      const jobsAfter = await db.sql<{ id: number; token_id: number | null }[]>`
        SELECT id, token_id FROM jobs ORDER BY id
      `;
      expect(jobsAfter.length).toBe(5); // One less job (NFT token #3 job deleted)
      // Verify job for NFT token #3 no longer exists
      const nftToken3JobAfter = jobsAfter.find(j => j.token_id === 4);
      expect(nftToken3JobAfter).toBeUndefined();
      // Verify jobs for surviving tokens still exist
      const nftToken1JobAfter = jobsAfter.find(j => j.token_id === 2);
      const nftToken2JobAfter = jobsAfter.find(j => j.token_id === 3);
      expect(nftToken1JobAfter).not.toBeUndefined();
      expect(nftToken2JobAfter).not.toBeUndefined();
    });
  });
});
