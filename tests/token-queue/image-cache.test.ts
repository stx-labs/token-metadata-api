import { strict as assert } from 'node:assert';
import { ENV } from '../../src/env.js';
import { processImageCache } from '../../src/token-processor/images/image-cache.js';
import { closeTestServer, startTestResponseServer, startTimeoutServer } from '../helpers.js';
import {
  ImageHttpError,
  ImageTimeoutError,
  TooManyRequestsHttpError,
} from '../../src/token-processor/util/errors.js';
import { before, describe, test } from 'node:test';

describe('Image cache', () => {
  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';
  const tokenNumber = 100n;

  before(() => {
    ENV.IMAGE_CACHE_PROCESSOR_ENABLED = true;
    ENV.IMAGE_CACHE_GCS_BUCKET_NAME = 'test';
    ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX = 'prefix/';
  });

  test('throws image fetch timeout error', async () => {
    ENV.METADATA_FETCH_TIMEOUT_MS = 50;
    const timeoutServer = await startTimeoutServer(100);
    await assert.rejects(
      processImageCache(timeoutServer.url, contract, tokenNumber),
      ImageTimeoutError
    );
    await closeTestServer(timeoutServer.server);
  });

  test('throws rate limit error', async () => {
    const responseServer = await startTestResponseServer('rate limit exceeded', 429);
    await assert.rejects(
      processImageCache(responseServer.url, contract, tokenNumber),
      TooManyRequestsHttpError
    );
    await closeTestServer(responseServer.server);
  });

  test('throws other server errors', async () => {
    const responseServer = await startTestResponseServer('not found', 404);
    await assert.rejects(
      processImageCache(responseServer.url, contract, tokenNumber),
      ImageHttpError
    );
    await closeTestServer(responseServer.server);
  });
});
