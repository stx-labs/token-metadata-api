import { ENV } from '../../env.js';
import { parseDataUrl, getFetchableMetadataUrl } from '../util/metadata-helpers.js';
import { logger } from '@stacks/api-toolkit';
import { PgStore } from '../../pg/pg-store.js';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import fs from 'fs';
import { Agent, fetch, errors } from 'undici';
import {
  ImageSizeExceededError,
  ImageTimeoutError,
  TooManyRequestsHttpError,
  UndiciCauseTypeError,
  ImageHttpError,
  ImageParseError,
} from '../util/errors.js';
import { pipeline } from 'node:stream/promises';
import { Storage } from '@google-cloud/storage';

/** Saves an image provided via a `data:` uri string to disk for processing. */
function convertDataImage(uri: string, tmpPath: string): string {
  const dataUrl = parseDataUrl(uri);
  if (!dataUrl) {
    throw new ImageParseError(`Data URL could not be parsed: ${uri}`);
  }
  if (!dataUrl.mediaType?.startsWith('image/')) {
    throw new ImageParseError(`Token image is a Data URL with a non-image media type: ${uri}`);
  }
  const filePath = `${tmpPath}/image`;
  const imageBuffer = Buffer.from(dataUrl.data, 'base64');
  fs.writeFileSync(filePath, imageBuffer);
  return filePath;
}

async function downloadImage(
  imgUrl: string,
  tmpPath: string,
  headers?: Record<string, string>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const filePath = `${tmpPath}/image`;
    fetch(imgUrl, {
      headers,
      signal: AbortSignal.timeout(ENV.METADATA_FETCH_TIMEOUT_MS),
      dispatcher: new Agent({
        headersTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
        bodyTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
        maxResponseSize: ENV.IMAGE_CACHE_MAX_BYTE_SIZE,
        connect: {
          rejectUnauthorized: false, // Ignore SSL cert errors.
        },
      }),
    })
      .then(response => {
        if (response.status == 429) {
          const errorHeaders = Object.fromEntries(response.headers.entries());
          reject(
            new TooManyRequestsHttpError(
              new URL(imgUrl),
              new errors.ResponseError(response.statusText, response.status, {
                headers: errorHeaders,
              })
            )
          );
          return;
        }
        const imageBody = response.body;
        if (!response.ok || !imageBody) {
          reject(
            new ImageHttpError(
              `ImageCache fetch error`,
              new errors.ResponseError(response.statusText, response.status, {
                headers: Object.fromEntries(response.headers.entries()),
              })
            )
          );
          return;
        }
        const imageStream = Readable.fromWeb(imageBody);
        imageStream.on('error', reject);
        const fileStream = fs.createWriteStream(filePath);
        fileStream.on('error', reject);
        pipeline(imageStream, fileStream)
          .then(_ => resolve(filePath))
          .catch(reject);
      })
      .catch(reject);
  });
}

async function transformImage(filePath: string, resize: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const outPath = resize ? `${filePath}-small.png` : `${filePath}.png`;
    let sharpStream = sharp(filePath, {
      failOn: 'error',
      // TODO: This ignores multi-frame GIF formats to optimize memory and because we're converting
      // to PNG anyway. We should support animated images in the future.
      pages: 1,
      page: 0,
      animated: false,
    });
    if (resize) {
      sharpStream = sharpStream.resize({
        width: ENV.IMAGE_CACHE_RESIZE_WIDTH,
        withoutEnlargement: true,
      });
    }
    sharpStream.on('error', reject);
    sharpStream = sharpStream.png().toFile(outPath, (err: Error | null, _info: unknown) => {
      if (err) reject(err);
      else resolve(outPath);
    });
  });
}

/**
 * Uploads processed token metadata images to a Google Cloud Storage bucket. It also provides the
 * option to resize the image to a max width before uploading so file sizes are more manageable upon
 * display.
 *
 * For a list of configuration options, see `env.ts`.
 */
export async function processImageCache(
  rawImgUrl: string,
  contractPrincipal: string,
  tokenNumber: bigint
): Promise<string[]> {
  logger.info(`ImageCache processing token ${contractPrincipal} (${tokenNumber}) at ${rawImgUrl}`);
  try {
    const gcs = new Storage();
    const gcsBucket = ENV.IMAGE_CACHE_GCS_BUCKET_NAME as string;

    const tmpPath = `tmp/${contractPrincipal}_${tokenNumber}`;
    fs.mkdirSync(tmpPath, { recursive: true });
    let original: string;
    if (rawImgUrl.startsWith('data:')) {
      original = convertDataImage(rawImgUrl, tmpPath);
    } else {
      const { url: httpUrl, fetchHeaders } = getFetchableMetadataUrl(rawImgUrl);
      original = await downloadImage(httpUrl.toString(), tmpPath, fetchHeaders);
    }

    const image1 = await transformImage(original);
    const remoteName1 = `${contractPrincipal}/${tokenNumber}.png`;
    await gcs.bucket(gcsBucket).upload(image1, {
      destination: `${ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX}${remoteName1}`,
    });

    const image2 = await transformImage(original, true);
    const remoteName2 = `${contractPrincipal}/${tokenNumber}-thumb.png`;
    await gcs.bucket(gcsBucket).upload(image2, {
      destination: `${ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX}${remoteName2}`,
    });

    fs.rmSync(tmpPath, { force: true, recursive: true });
    return [
      `${ENV.IMAGE_CACHE_CDN_BASE_PATH}${remoteName1}`,
      `${ENV.IMAGE_CACHE_CDN_BASE_PATH}${remoteName2}`,
    ];
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new ImageTimeoutError(new URL(rawImgUrl));
      }
    }
    if (error instanceof TypeError) {
      const typeError = error as UndiciCauseTypeError;
      if (
        typeError.cause instanceof errors.HeadersTimeoutError ||
        typeError.cause instanceof errors.BodyTimeoutError ||
        typeError.cause instanceof errors.ConnectTimeoutError
      ) {
        throw new ImageTimeoutError(new URL(rawImgUrl));
      }
      if (typeError.cause instanceof errors.ResponseExceededMaxSizeError) {
        throw new ImageSizeExceededError(`ImageCache image too large: ${rawImgUrl}`);
      }
      if ((typeError.cause as { toString(): string }).toString().includes('ECONNRESET')) {
        throw new ImageHttpError(`ImageCache server connection interrupted`, typeError);
      }
    }
    throw error;
  }
}

export async function reprocessTokenImageCache(
  db: PgStore,
  contractPrincipal: string,
  tokenIds?: number[]
): Promise<void> {
  await db.sqlWriteTransaction(async _sql => {
    const imageUris = await db.getTokenImageUris(contractPrincipal, tokenIds);
    for (const token of imageUris) {
      try {
        const [cached, thumbnail] = await processImageCache(
          getFetchableMetadataUrl(token.image).url.toString(),
          contractPrincipal,
          BigInt(token.token_number)
        );
        if (cached && thumbnail)
          await db.core.updateTokenCachedImages(token.token_id, cached, thumbnail);
      } catch (error) {
        logger.error(error, `ImageCache unable to reprocess token image cache`);
      }
    }
  });
}
