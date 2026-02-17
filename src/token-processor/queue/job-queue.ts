import PQueue from 'p-queue';
import { PgStore } from '../../pg/pg-store';
import { DbJob, DbJobStatus } from '../../pg/types';
import { ENV } from '../../env';
import { ProcessSmartContractJob } from './job/process-smart-contract-job';
import { ProcessTokenJob } from './job/process-token-job';
import { logger, timeout } from '@stacks/api-toolkit';
import { StacksNetworkName } from '@stacks/network';
import { UpdateTokenSupplyJob } from './job/update-token-supply-job';

/**
 * A priority queue that organizes all necessary work for contract ingestion and token metadata
 * processing.
 *
 * Every job processed by this queue is defined as a `Job` subclass and strictly corresponds to one
 * row in the `jobs` DB table, which marks its processing status and related objects to be worked on
 * (smart contract or token). Each of these job rows are usually created during smart contract
 * import and/or processing (see `BlockchainImporter` and `ProcessSmartContractJob`), but new jobs
 * could be added to the DB by any other class in the future, even while the queue is operating.
 *
 * This object essentially runs an infinite loop that follows these steps:
 * 1. Upon `start()`, it fetches a set number of job rows that are `'pending'` and loads their
 *    corresponding `Job` objects into memory for processing, marking those rows now as `'queued'`.
 * 2. It executes each loaded job to completion concurrently. Depending on success or failure, the
 *    job row is marked as either `'done'` or `'failed'`.
 * 3. Once all loaded jobs are done (and the queue is now empty), it goes back to step 1.
 *
 * There are two env vars that can help you tune how the queue performs:
 * * `ENV.JOB_QUEUE_SIZE_LIMIT`: The in-memory size of the queue, i.e. the number of pending jobs
 *    that are loaded from the database while they wait for execution (see step 1 above).
 * * `ENV.JOB_QUEUE_CONCURRENCY_LIMIT`: The number of jobs that will be ran simultaneously.
 *
 * This queue runs continuously and can handle an unlimited number of jobs.
 */
export class JobQueue {
  private readonly queue: PQueue;
  private readonly db: PgStore;
  private readonly network: StacksNetworkName;
  /** IDs of jobs currently being processed by the queue. */
  private jobIds: Set<number>;
  private abortController = new AbortController();

  constructor(args: { db: PgStore; network: StacksNetworkName }) {
    this.db = args.db;
    this.network = args.network;
    this.queue = new PQueue({
      concurrency: ENV.JOB_QUEUE_CONCURRENCY_LIMIT,
      autoStart: false,
    });
    this.jobIds = new Set();
  }

  /**
   * Starts executing queue jobs. Jobs had to be previously loaded via `add()` for processing to
   * begin.
   */
  start() {
    logger.info(`JobQueue starting queue...`);
    this.abortController = new AbortController();
    this.queue.start();
    void this.runQueueLoop();
  }

  /**
   * Stops the queue after waiting for its current work to be complete.
   */
  async stop() {
    logger.info(`JobQueue stopping, waiting on ${this.queue.pending} pending jobs...`);
    this.abortController.abort();
    await this.queue.onIdle();
    this.queue.pause();
  }

  isRunning(): boolean {
    return !this.abortController.signal.aborted;
  }

  /**
   * Loads a job into the queue for execution. The `DbJob` row will be marked as `'queued'` while it
   * waits for processing. A `Job` subclass will be instantiated depending on the type of job this
   * row describes.
   * @param job - A row from the `jobs` DB table that needs processing
   */
  protected async add(job: DbJob): Promise<void> {
    if (
      this.abortController.signal.aborted ||
      this.jobIds.has(job.id) ||
      this.queue.size + this.queue.pending >= ENV.JOB_QUEUE_SIZE_LIMIT
    ) {
      return;
    }
    await this.db.updateJobStatus({ id: job.id, status: DbJobStatus.queued });
    this.jobIds.add(job.id);
    void this.queue.add(async () => {
      try {
        if (!this.abortController.signal.aborted) {
          if (job.token_id) {
            await new ProcessTokenJob({ db: this.db, job, network: this.network }).work();
          } else if (job.smart_contract_id) {
            await new ProcessSmartContractJob({ db: this.db, job, network: this.network }).work();
          } else if (job.token_supply_id) {
            await new UpdateTokenSupplyJob({ db: this.db, job, network: this.network }).work();
          } else {
            throw new Error(`JobQueue invalid job type: ${job.id}`);
          }
        } else {
          logger.info(`JobQueue cancelling job ${job.id}, queue is now closed`);
        }
      } finally {
        this.jobIds.delete(job.id);
      }
    });
  }

  /**
   * Loads a job batch from the DB into the queue. Called by `runQueueLoop` when the queue is empty.
   * @returns Total added jobs
   */
  protected async addJobBatch(): Promise<number> {
    // If the queue is empty but we still have jobs set as `queued`, it means those jobs failed to
    // run or there was a postgres error that couldn't otherwise mark them as completed. We'll try
    // to get them re-processed now before moving on to the rest of the queue.
    const queued = await this.db.getQueuedJobs({ excludingIds: Array.from(this.jobIds) });
    if (queued.length > 0) {
      for (const job of queued) {
        await this.add(job);
      }
      return queued.length;
    }
    // Get `pending` jobs and enqueue.
    const jobs = await this.db.getPendingJobBatch({ limit: ENV.JOB_QUEUE_SIZE_LIMIT });
    if (jobs.length > 0) {
      for (const job of jobs) {
        await this.add(job);
      }
      return jobs.length;
    }
    return 0;
  }

  /**
   * Infinite loop that replenishes the queue by taking rows from the `jobs` table that are marked
   * `'pending'` and pushing them for execution. Once the queue is idle, it grabs more jobs for
   * processing, repeating this cycle until the jobs table is completely processed.
   */
  private async runQueueLoop() {
    while (!this.abortController.signal.aborted) {
      try {
        const loadedJobs = await this.addJobBatch();
        if (loadedJobs === 0) {
          await timeout(5_000);
        }
        await this.queue.onIdle();
      } catch (error) {
        logger.error(error, 'JobQueue loop error');
        await timeout(1_000);
      }
    }
  }
}
