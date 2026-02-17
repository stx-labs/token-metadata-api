import { cycleMigrations, timeout } from '@stacks/api-toolkit';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbJob, DbSipNumber, DbSmartContractInsert } from '../../src/pg/types';
import { RetryableJobError } from '../../src/token-processor/queue/errors';
import { Job } from '../../src/token-processor/queue/job/job';
import { UserError } from '../../src/token-processor/util/errors';
import { insertAndEnqueueTestContract } from '../helpers';

class TestRetryableJob extends Job {
  description(): string {
    return 'test';
  }
  handler(): Promise<void> {
    throw new RetryableJobError('test');
  }
}

class TestUserErrorJob extends Job {
  description(): string {
    return 'test';
  }
  handler(): Promise<void> {
    throw new UserError('test');
  }
}

class TestDbJob extends Job {
  description(): string {
    return 'test';
  }
  async handler(): Promise<void> {
    await this.db.sql<{ version: string }[]>`SELECT version()`;
  }
}

describe('Job', () => {
  let db: PgStore;
  let dbJob: DbJob;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
    dbJob = await insertAndEnqueueTestContract(db, 'ABCD.test-ft', DbSipNumber.sip010);
  });

  afterEach(async () => {
    await db.close();
  });

  test('valid job marked as done', async () => {
    const job = new TestDbJob({ db, job: dbJob, network: 'mainnet' });

    await expect(job.work()).resolves.not.toThrow();
    const jobs1 = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs1.length).toBe(0);

    const dbJob1 = await db.getJob({ id: dbJob.id });
    expect(dbJob1?.status).toBe('done');
  });

  test('retryable error increases retry_count', async () => {
    const job = new TestRetryableJob({ db, job: dbJob, network: 'mainnet' });

    await expect(job.work()).resolves.not.toThrow();
    const jobs1 = await db.getJob({ id: 1 });
    expect(jobs1?.retry_count).toBe(1);
    expect(jobs1?.status).toBe('pending');

    await expect(job.work()).resolves.not.toThrow();
    const jobs2 = await db.getJob({ id: 1 });
    expect(jobs2?.retry_count).toBe(2);
    expect(jobs2?.status).toBe('pending');
  });

  test('user error marks job invalid', async () => {
    const job = new TestUserErrorJob({ db, job: dbJob, network: 'mainnet' });

    await expect(job.work()).resolves.not.toThrow();
    const jobs1 = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs1.length).toBe(0);

    const dbJob1 = await db.getJob({ id: dbJob.id });
    expect(dbJob1?.status).toBe('invalid');
  });

  test('retry_count limit reached marks entry as failed', async () => {
    ENV.JOB_QUEUE_STRICT_MODE = false;
    ENV.JOB_QUEUE_MAX_RETRIES = 0;
    const job = new TestRetryableJob({ db, job: dbJob, network: 'mainnet' });

    await expect(job.work()).resolves.not.toThrow();
    const status = await db.sql<{ status: string }[]>`SELECT status FROM jobs`;
    expect(status[0].status).toBe('failed');
  });

  test('strict mode ignores retry_count limit', async () => {
    ENV.JOB_QUEUE_STRICT_MODE = true;
    ENV.JOB_QUEUE_MAX_RETRIES = 0;
    ENV.JOB_QUEUE_RETRY_AFTER_MS = 0;
    const job = new TestRetryableJob({ db, job: dbJob, network: 'mainnet' });

    await expect(job.work()).resolves.not.toThrow();
    const jobs1 = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs1[0].retry_count).toBe(1);
    expect(jobs1[0].status).toBe('pending');
  });

  test('pending job batches consider retry_after', async () => {
    ENV.JOB_QUEUE_RETRY_AFTER_MS = 200;
    const job = new TestRetryableJob({ db, job: dbJob, network: 'mainnet' });

    await expect(job.work()).resolves.not.toThrow();
    const jobs1 = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs1).toHaveLength(0);

    await timeout(300);
    const jobs2 = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs2).toHaveLength(1);
  });

  test('db errors are not re-thrown', async () => {
    await db.close();
    const job = new TestDbJob({ db, job: dbJob, network: 'mainnet' });
    await expect(job.work()).resolves.not.toThrow();
  });
});
