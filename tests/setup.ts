// ts-unused-exports:disable-next-line
export default (): void => {
  process.env.STACKS_NODE_RPC_HOST = 'localhost';
  process.env.STACKS_NODE_RPC_PORT = '24000';
  process.env.PGHOST = 'localhost';
  process.env.PGPORT = '5432';
  process.env.PGUSER = 'postgres';
  process.env.PGDATABASE = 'postgres';
  process.env.PGPASSWORD = 'postgres';
  process.env.NETWORK = 'mainnet';
  process.env.SNP_REDIS_URL = 'redis://localhost:6379';
  process.env.SNP_REDIS_STREAM_KEY_PREFIX = 'test';
};
