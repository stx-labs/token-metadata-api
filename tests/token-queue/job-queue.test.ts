import { strict as assert } from 'node:assert';
import { ENV } from '../../src/env.js';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store.js';
import { DbJob, DbJobStatus, DbSipNumber } from '../../src/pg/types.js';
import { JobQueue } from '../../src/token-processor/queue/job-queue.js';
import { insertAndEnqueueTestContract, setupEnv } from '../helpers.js';
import { cycleMigrations, timeout } from '@stacks/api-toolkit';
import { StacksNetworkName } from '@stacks/network';
import { afterEach, beforeEach, describe, test } from 'node:test';

class TestJobQueue extends JobQueue {
  constructor(args: { db: PgStore; network: StacksNetworkName }) {
    super(args);
  }
  async testAdd(job: DbJob): Promise<void> {
    return this.add(job);
  }
  async testAddJobBatch(): Promise<number> {
    return this.addJobBatch();
  }
}

describe('JobQueue', () => {
  let db: PgStore;
  let queue: TestJobQueue;

  beforeEach(async () => {
    setupEnv();
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
    queue = new TestJobQueue({ db, network: 'mainnet' });
  });

  afterEach(async () => {
    await db.close();
  });

  test('skips adding job if queue is at limit', async () => {
    ENV.JOB_QUEUE_SIZE_LIMIT = 1;

    const job1 = await insertAndEnqueueTestContract(db, 'ABCD.test-ft', DbSipNumber.sip010);
    await queue.testAdd(job1);

    const count1 = await db.sql<
      { count: number }[]
    >`SELECT COUNT(*) FROM jobs WHERE status = 'queued'`;
    assert.strictEqual(count1.count, 1);

    const job2 = await insertAndEnqueueTestContract(db, 'ABCD.test-ft2', DbSipNumber.sip010);
    await queue.testAdd(job2);

    const count2 = await db.sql<
      { count: number }[]
    >`SELECT COUNT(*) FROM jobs WHERE status = 'queued'`;
    assert.strictEqual(count2.count, 1);
  });

  test('adds job batches for processing', async () => {
    ENV.JOB_QUEUE_SIZE_LIMIT = 10;

    const job1 = await insertAndEnqueueTestContract(db, 'ABCD.test-ft', DbSipNumber.sip010);
    // Set it as queued already as if something had gone wrong.
    await db.sql`UPDATE jobs SET status='queued' WHERE id=${job1.id}`;

    const job2 = await insertAndEnqueueTestContract(db, 'ABCD.test-ft2', DbSipNumber.sip010);
    const job3 = await insertAndEnqueueTestContract(db, 'ABCD.test-ft3', DbSipNumber.sip010);

    // Queued is taken first.
    const added1 = await queue.testAddJobBatch();
    assert.strictEqual(added1, 1);
    assert.strictEqual((await db.getJob({ id: job1.id }))?.status, 'queued');
    assert.strictEqual((await db.getJob({ id: job2.id }))?.status, 'pending');
    assert.strictEqual((await db.getJob({ id: job3.id }))?.status, 'pending');

    // All of the rest are taken.
    await db.core.updateJobStatus({ id: job1.id, status: DbJobStatus.done });
    const added2 = await queue.testAddJobBatch();
    assert.strictEqual(added2, 2);
    assert.strictEqual((await db.getJob({ id: job1.id }))?.status, 'done');
    assert.strictEqual((await db.getJob({ id: job2.id }))?.status, 'queued');
    assert.strictEqual((await db.getJob({ id: job3.id }))?.status, 'queued');
  });

  test('pg connection errors are not re-thrown', async () => {
    await insertAndEnqueueTestContract(db, 'ABCD.test-ft', DbSipNumber.sip010);
    const queue = new JobQueue({ db, network: 'mainnet' });
    // Close DB and start the queue. If the error is not handled correctly, the test will fail.
    await db.close();
    queue.start();
    // Wait 2 seconds and kill the queue.
    await timeout(2000);
    await queue.stop();
  });
});
