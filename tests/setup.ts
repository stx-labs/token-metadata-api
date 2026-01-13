// ts-unused-exports:disable-next-line
export default (): void => {
  process.env.PGDATABASE = 'postgres';
  process.env.NETWORK = 'mainnet';
  process.env.SNP_REDIS_URL = 'redis://localhost:6379';
  process.env.SNP_REDIS_STREAM_KEY_PREFIX = 'test';
};
