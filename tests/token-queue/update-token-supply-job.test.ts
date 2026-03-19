import { strict as assert } from 'node:assert';
import { cvToHex, uintCV } from '@stacks/transactions';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbJob, DbSipNumber } from '../../src/pg/types';
import { ENV } from '../../src/env';
import { cycleMigrations } from '@stacks/api-toolkit';
import { insertAndEnqueueTestContractWithTokens, markAllJobsAsDone } from '../helpers';
import { UpdateTokenSupplyJob } from '../../src/token-processor/queue/job/update-token-supply-job';

describe('UpdateTokenSupplyJob', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('FT', () => {
    let tokenSupplyJob: DbJob;

    beforeEach(async () => {
      await insertAndEnqueueTestContractWithTokens(db, 'ABCD.test-ft', DbSipNumber.sip010, 1n);
      await markAllJobsAsDone(db);
      [tokenSupplyJob] = await db.sql<
        DbJob[]
      >`INSERT INTO jobs (token_supply_id) VALUES (1) RETURNING *`;
    });

    test('updates token supply', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(
        `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`
      );
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-total-supply',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(1997500000000)),
        });
      setGlobalDispatcher(agent);

      const processor = new UpdateTokenSupplyJob({ db, job: tokenSupplyJob, network: 'mainnet' });
      await processor.work();

      const token = await db.getToken({ id: 1 });
      assert.notStrictEqual(token, undefined);
      assert.strictEqual(token?.total_supply, '1997500000000');
    });

    test('accepts FTs with incorrect total supply return type', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(
        `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`
      );
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-total-supply',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          // Simulate an ALEX-style error when fetching `get-total-supply` for wrapped tokens.
          result: '0x080100000000000000000000000000001774',
        });
      setGlobalDispatcher(agent);

      const processor = new UpdateTokenSupplyJob({ db, job: tokenSupplyJob, network: 'mainnet' });
      await processor.work();

      const token = await db.getToken({ id: 1 });
      assert.notStrictEqual(token, undefined);
      assert.strictEqual(token?.total_supply, null);
    });
  });

  describe('SFT', () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = 'key-alex-autoalex-v1';
    let tokenSupplyJob: DbJob;

    beforeEach(async () => {
      await insertAndEnqueueTestContractWithTokens(
        db,
        `${address}.${contractId}`,
        DbSipNumber.sip013,
        1n
      );
      await markAllJobsAsDone(db);
      [tokenSupplyJob] = await db.sql<
        DbJob[]
      >`INSERT INTO jobs (token_supply_id) VALUES (1) RETURNING *`;
    });

    test('updates semi fungible token supply', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(
        `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`
      );
      interceptor
        .intercept({
          path: `/v2/contracts/call-read/${address}/${contractId}/get-total-supply`,
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(200200200)),
        });
      setGlobalDispatcher(agent);

      const processor = new UpdateTokenSupplyJob({ db, job: tokenSupplyJob, network: 'mainnet' });
      await processor.work();

      const token = await db.getToken({ id: 1 });
      assert.notStrictEqual(token, undefined);
      assert.strictEqual(token?.total_supply, '200200200');
    });
  });
});
