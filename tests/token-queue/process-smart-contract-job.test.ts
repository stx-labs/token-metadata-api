import { strict as assert } from 'node:assert';
import { cvToHex, uintCV } from '@stacks/transactions';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbSipNumber, DbToken, DbTokenType } from '../../src/pg/types';
import { ProcessSmartContractJob } from '../../src/token-processor/queue/job/process-smart-contract-job';
import { ENV } from '../../src/env';
import { cycleMigrations } from '@stacks/api-toolkit';
import { insertAndEnqueueTestContract } from '../helpers';

describe('ProcessSmartContractJob', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  test('enqueues 1 token per FT contract', async () => {
    const job = await insertAndEnqueueTestContract(db, 'ABCD.test-ft', DbSipNumber.sip010);
    const processor = new ProcessSmartContractJob({
      db,
      job,
      network: 'mainnet',
    });
    await processor.work();

    const tokens = await db.sql<DbToken[]>`SELECT * FROM tokens`;
    assert.strictEqual(tokens.count, 1);
    assert.strictEqual(tokens[0].type, DbTokenType.ft);
    assert.strictEqual(tokens[0].smart_contract_id, 1);
  });

  test('enqueues all tokens per NFT contract', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
      .intercept({
        path: '/v2/contracts/call-read/ABCD/test-nft/get-last-token-id',
        method: 'POST',
      })
      .reply(200, {
        okay: true,
        result: cvToHex(uintCV(5)),
      });
    setGlobalDispatcher(agent);

    const job = await insertAndEnqueueTestContract(db, 'ABCD.test-nft', DbSipNumber.sip009);
    const processor = new ProcessSmartContractJob({
      db,
      job,
      network: 'mainnet',
    });
    await processor.work();

    const tokens = await db.sql<DbToken[]>`SELECT * FROM tokens`;
    assert.strictEqual(tokens.count, 5);
    assert.strictEqual(tokens[0].type, DbTokenType.nft);
    assert.strictEqual(tokens[0].smart_contract_id, 1);
  });

  test('ignores NFT contract that exceeds max token count', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
      .intercept({
        path: '/v2/contracts/call-read/ABCD/test-nft/get-last-token-id',
        method: 'POST',
      })
      .reply(200, {
        okay: true,
        result: cvToHex(uintCV(10000000000)),
      });
    setGlobalDispatcher(agent);

    const job = await insertAndEnqueueTestContract(db, 'ABCD.test-nft', DbSipNumber.sip009);
    const processor = new ProcessSmartContractJob({
      db,
      job,
      network: 'mainnet',
    });
    await processor.work();

    const tokens = await db.sql<DbToken[]>`SELECT * FROM tokens`;
    assert.strictEqual(tokens.count, 0);
  });
});
