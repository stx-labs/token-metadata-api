import { cvToHex, tupleCV, bufferCV, listCV, uintCV, stringUtf8CV } from '@stacks/transactions';
import { DbSipNumber } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  getLatestContractTokenNotifications,
  getLatestTokenNotification,
  insertAndEnqueueTestContractWithTokens,
  markAllJobsAsDone,
  TestTransactionBuilder,
  TestBlockBuilder,
} from '../helpers';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor';

describe('token metadata notifications', () => {
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

  test('enqueues notification for all tokens in contract', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    await expect(db.getPendingJobBatch({ limit: 10 })).resolves.toHaveLength(3);
    const notifs = await getLatestContractTokenNotifications(db, contractId);
    expect(notifs).toHaveLength(3);
    expect(notifs[0].token_id).toBe(1);
    expect(notifs[0].update_mode).toBe('standard');
    expect(notifs[0].block_height).toBe(100);
  });

  test('enqueues notification for specific tokens in contract', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1), uintCV(2)]),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs.length).toBe(2); // Only two tokens
    expect(jobs[0].token_id).toBe(1);
    await expect(getLatestTokenNotification(db, 1)).resolves.not.toBeUndefined();
    expect(jobs[1].token_id).toBe(2);
    await expect(getLatestTokenNotification(db, 2)).resolves.not.toBeUndefined();
    await expect(getLatestTokenNotification(db, 3)).resolves.toBeUndefined();
  });

  test('updates token refresh mode', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                    'update-mode': stringUtf8CV('frozen'), // Mark as frozen.
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const notif = await getLatestTokenNotification(db, 1);
    expect(notif?.update_mode).toBe('frozen');
  });

  test('ignores notification for frozen tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    // Mark as frozen
    await processor.processBlock(
      new TestBlockBuilder({ block_height: 90 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                    'update-mode': bufferCV(Buffer.from('frozen')),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const jobs2 = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs2.length).toBe(0); // No tokens queued.
    const notif = await getLatestTokenNotification(db, 1);
    expect(notif).not.toBeUndefined();
    expect(notif?.block_height).toBe(90);
    expect(notif?.update_mode).toBe('frozen'); // Keeps the old frozen notif
  });

  test('second token notification replaces previous', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 90 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
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
    await markAllJobsAsDone(db);
    const notif1 = await getLatestTokenNotification(db, 1);
    expect(notif1).not.toBeUndefined();
    expect(notif1?.block_height).toBe(90);
    expect(notif1?.update_mode).toBe('dynamic');
    expect(notif1?.ttl).toBe('3600');

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const notif2 = await getLatestTokenNotification(db, 1);
    expect(notif2).not.toBeUndefined();
    expect(notif2?.block_height).toBe(100);
    expect(notif2?.update_mode).toBe('standard');
    expect(notif2?.ttl).toBeNull();
  });

  test('contract notification replaces token notification', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 90 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                    'token-ids': listCV([uintCV(1)]),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );
    await markAllJobsAsDone(db);
    const notif1 = await getLatestTokenNotification(db, 1);
    expect(notif1).not.toBeUndefined();
    expect(notif1?.block_height).toBe(90);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    const notif2 = await getLatestTokenNotification(db, 1);
    expect(notif2).not.toBeUndefined();
    expect(notif2?.block_height).toBe(100);
  });

  // test('rolls back notification', async () => {
  //   const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
  //   const contractId = `${address}.friedger-pool-nft`;
  //   await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);

  //   await db.chainhook.processPayload(
  //     new TestChainhookPayloadBuilder()
  //       .apply()
  //       .block({ height: 101 })
  //       .transaction({ hash: '0x01', sender: address })
  //       .event({
  //         type: 'SmartContractEvent',
  //         position: { index: 0 },
  //         data: {
  //           contract_identifier: contractId,
  //           topic: 'print',
  //           raw_value: cvToHex(
  //             tupleCV({
  //               notification: bufferCV(Buffer.from('token-metadata-update')),
  //               payload: tupleCV({
  //                 'token-class': bufferCV(Buffer.from('nft')),
  //                 'contract-id': bufferCV(Buffer.from(contractId)),
  //               }),
  //             })
  //           ),
  //         },
  //       })
  //       .build()
  //   );
  //   await markAllJobsAsDone(db);
  //   await expect(getLatestTokenNotification(db, 1)).resolves.not.toBeUndefined();
  //   await db.chainhook.processPayload(
  //     new TestChainhookPayloadBuilder()
  //       .rollback()
  //       .block({ height: 101 })
  //       .transaction({ hash: '0x01', sender: address })
  //       .event({
  //         type: 'SmartContractEvent',
  //         position: { index: 0 },
  //         data: {
  //           contract_identifier: contractId,
  //           topic: 'print',
  //           raw_value: cvToHex(
  //             tupleCV({
  //               notification: bufferCV(Buffer.from('token-metadata-update')),
  //               payload: tupleCV({
  //                 'token-class': bufferCV(Buffer.from('nft')),
  //                 'contract-id': bufferCV(Buffer.from(contractId)),
  //               }),
  //             })
  //           ),
  //         },
  //       })
  //       .build()
  //   );
  //   await expect(getLatestTokenNotification(db, 1)).resolves.toBeUndefined();
  // });

  // test('second notification rollback restores pointer to the first notification', async () => {
  //   const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
  //   const contractId = `${address}.friedger-pool-nft`;
  //   await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);

  //   // Write 2 notifications, test rollback changes ref to old notification.
  //   await db.chainhook.processPayload(
  //     new TestChainhookPayloadBuilder()
  //       .apply()
  //       .block({ height: 100 })
  //       .transaction({ hash: '0x01', sender: address })
  //       .event({
  //         type: 'SmartContractEvent',
  //         position: { index: 0 },
  //         data: {
  //           contract_identifier: contractId,
  //           topic: 'print',
  //           raw_value: cvToHex(
  //             tupleCV({
  //               notification: bufferCV(Buffer.from('token-metadata-update')),
  //               payload: tupleCV({
  //                 'token-class': bufferCV(Buffer.from('nft')),
  //                 'contract-id': bufferCV(Buffer.from(contractId)),
  //                 'token-ids': listCV([uintCV(1)]),
  //               }),
  //             })
  //           ),
  //         },
  //       })
  //       .build()
  //   );
  //   await db.chainhook.processPayload(
  //     new TestChainhookPayloadBuilder()
  //       .apply()
  //       .block({ height: 101 })
  //       .transaction({ hash: '0x01', sender: address })
  //       .event({
  //         type: 'SmartContractEvent',
  //         position: { index: 0 },
  //         data: {
  //           contract_identifier: contractId,
  //           topic: 'print',
  //           raw_value: cvToHex(
  //             tupleCV({
  //               notification: bufferCV(Buffer.from('token-metadata-update')),
  //               payload: tupleCV({
  //                 'token-class': bufferCV(Buffer.from('nft')),
  //                 'contract-id': bufferCV(Buffer.from(contractId)),
  //                 'token-ids': listCV([uintCV(1)]),
  //                 'update-mode': bufferCV(Buffer.from('frozen')),
  //               }),
  //             })
  //           ),
  //         },
  //       })
  //       .build()
  //   );
  //   await markAllJobsAsDone(db);
  //   const notif2 = await getLatestTokenNotification(db, 1);
  //   expect(notif2).not.toBeUndefined();
  //   expect(notif2?.block_height).toBe(101);
  //   expect(notif2?.update_mode).toBe('frozen');

  //   await db.chainhook.processPayload(
  //     new TestChainhookPayloadBuilder()
  //       .rollback()
  //       .block({ height: 101 })
  //       .transaction({ hash: '0x01', sender: address })
  //       .event({
  //         type: 'SmartContractEvent',
  //         position: { index: 0 },
  //         data: {
  //           contract_identifier: contractId,
  //           topic: 'print',
  //           raw_value: cvToHex(
  //             tupleCV({
  //               notification: bufferCV(Buffer.from('token-metadata-update')),
  //               payload: tupleCV({
  //                 'token-class': bufferCV(Buffer.from('nft')),
  //                 'contract-id': bufferCV(Buffer.from(contractId)),
  //                 'token-ids': listCV([uintCV(1)]),
  //                 'update-mode': bufferCV(Buffer.from('frozen')),
  //               }),
  //             })
  //           ),
  //         },
  //       })
  //       .build()
  //   );
  //   const notif1 = await getLatestTokenNotification(db, 1);
  //   expect(notif1).not.toBeUndefined();
  //   expect(notif1?.block_height).toBe(100);
  //   expect(notif1?.update_mode).toBe('standard');
  // });

  test('ignores other contract log events', async () => {
    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
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
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
  });

  test('ignores notification from incorrect sender', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({ block_height: 100 })
        .addTransaction(
          new TestTransactionBuilder({
            tx_id: '0x01',
            // Incorrect sender
            sender: 'SP29BPZ6BD5D8509Y9VP70J0V7VKKDDFCRPHA0T6A',
          })
            .addContractEvent(
              'SP29BPZ6BD5D8509Y9VP70J0V7VKKDDFCRPHA0T6A.another-contract',
              cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                  }),
                })
              )
            )
            .build()
        )
        .build()
    );

    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
  });
});
