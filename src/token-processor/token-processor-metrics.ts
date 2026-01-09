import * as prom from 'prom-client';
import { PgStore } from '../pg/pg-store';

export class TokenProcessorMetrics {
  readonly token_metadata_block_height: prom.Gauge;
  /** Job count divided by status */
  readonly token_metadata_job_count: prom.Gauge;
  /** Smart contract count divided by SIP number */
  readonly token_metadata_smart_contract_count: prom.Gauge;
  /** Token count divided by type */
  readonly token_metadata_token_count: prom.Gauge;

  static configure(db: PgStore): TokenProcessorMetrics {
    return new TokenProcessorMetrics(db);
  }

  private constructor(db: PgStore) {
    this.token_metadata_block_height = new prom.Gauge({
      name: `token_metadata_block_height`,
      help: 'The most recent Bitcoin block height ingested by the API',
      async collect() {
        const height = await db.core.getChainTip(db.sql);
        this.set(height?.block_height ?? 0);
      },
    });
    this.token_metadata_job_count = new prom.Gauge({
      name: `token_metadata_job_count`,
      help: 'Job count divided by status',
      labelNames: ['status'],
      async collect() {
        const jobStatusCounts = await db.getJobStatusCounts();
        for (const count of jobStatusCounts) {
          this.set({ status: count.status }, count.count);
        }
      },
    });
    this.token_metadata_smart_contract_count = new prom.Gauge({
      name: `token_metadata_smart_contract_count`,
      help: 'Smart contract count divided by SIP number',
      labelNames: ['sip'],
      async collect() {
        const contractCounts = await db.getSmartContractCounts();
        for (const count of contractCounts) {
          this.set({ sip: count.sip }, count.count);
        }
      },
    });
    this.token_metadata_token_count = new prom.Gauge({
      name: `token_metadata_token_count`,
      help: 'Token count divided by type',
      labelNames: ['type'],
      async collect() {
        const tokenCounts = await db.getTokenCounts();
        for (const count of tokenCounts) {
          this.set({ type: count.type }, count.count);
        }
      },
    });
  }
}
