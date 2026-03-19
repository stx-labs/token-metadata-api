import {
  after as afterFn,
  afterEach as afterEachFn,
  before as beforeFn,
  beforeEach as beforeEachFn,
  describe as describeFn,
  it as itFn,
  mock as mockFn,
  test as testFn,
} from 'node:test';

declare global {
  // BDD/TAP-style globals for existing suites.
  var describe: typeof describeFn;
  var test: typeof testFn;
  var it: typeof itFn;
  var beforeAll: typeof beforeFn;
  var afterAll: typeof afterFn;
  var beforeEach: typeof beforeEachFn;
  var afterEach: typeof afterEachFn;
  var mock: typeof mockFn;
}

globalThis.describe = describeFn;
globalThis.test = testFn;
globalThis.it = itFn;
globalThis.beforeAll = beforeFn;
globalThis.afterAll = afterFn;
globalThis.beforeEach = beforeEachFn;
globalThis.afterEach = afterEachFn;
globalThis.mock = mockFn;

process.env.STACKS_NODE_RPC_HOST = process.env.STACKS_NODE_RPC_HOST ?? 'localhost';
process.env.STACKS_NODE_RPC_PORT = process.env.STACKS_NODE_RPC_PORT ?? '24000';
process.env.PGHOST = process.env.PGHOST ?? 'localhost';
process.env.PGPORT = process.env.PGPORT ?? '5432';
process.env.PGUSER = process.env.PGUSER ?? 'postgres';
process.env.PGDATABASE = process.env.PGDATABASE ?? 'postgres';
process.env.PGPASSWORD = process.env.PGPASSWORD ?? 'postgres';
process.env.NETWORK = process.env.NETWORK ?? 'mainnet';
process.env.SNP_REDIS_URL = process.env.SNP_REDIS_URL ?? 'redis://localhost:6379';
process.env.SNP_REDIS_STREAM_KEY_PREFIX = process.env.SNP_REDIS_STREAM_KEY_PREFIX ?? 'test';
