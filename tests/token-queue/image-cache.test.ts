import { ENV } from '../../src/env';
import { processImageCache } from '../../src/token-processor/images/image-cache';
import { closeTestServer, startTestResponseServer, startTimeoutServer } from '../helpers';
import {
  ImageHttpError,
  ImageTimeoutError,
  TooManyRequestsHttpError,
} from '../../src/token-processor/util/errors';

describe('Image cache', () => {
  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';
  const tokenNumber = 100n;

  beforeAll(() => {
    ENV.IMAGE_CACHE_PROCESSOR_ENABLED = true;
    ENV.IMAGE_CACHE_GCS_BUCKET_NAME = 'test';
    ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX = 'prefix/';
  });

  test('throws image fetch timeout error', async () => {
    ENV.METADATA_FETCH_TIMEOUT_MS = 50;
    const timeoutServer = await startTimeoutServer(100);
    await expect(processImageCache(timeoutServer.url, contract, tokenNumber)).rejects.toThrow(
      ImageTimeoutError
    );
    await closeTestServer(timeoutServer.server);
  }, 10000);

  test('throws rate limit error', async () => {
    const responseServer = await startTestResponseServer('rate limit exceeded', 429);
    await expect(processImageCache(responseServer.url, contract, tokenNumber)).rejects.toThrow(
      TooManyRequestsHttpError
    );
    await closeTestServer(responseServer.server);
  }, 10000);

  test('throws other server errors', async () => {
    const responseServer = await startTestResponseServer('not found', 404);
    await expect(processImageCache(responseServer.url, contract, tokenNumber)).rejects.toThrow(
      ImageHttpError
    );
    await closeTestServer(responseServer.server);
  }, 10000);
});
