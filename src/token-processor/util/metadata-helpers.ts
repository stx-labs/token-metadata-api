import * as querystring from 'querystring';
import JSON5 from 'json5';
import { Agent, errors, request } from 'undici';
import {
  DbMetadataAttributeInsert,
  DbMetadataInsert,
  DbMetadataLocaleInsertBundle,
  DbMetadataPropertyInsert,
  DbSmartContract,
  DbToken,
} from '../../pg/types.js';
import { ENV } from '../../env.js';
import {
  MetadataHttpError,
  MetadataParseError,
  MetadataSizeExceededError,
  MetadataTimeoutError,
  TooManyRequestsHttpError,
  UndiciCauseTypeError,
} from './errors.js';
import { RetryableJobError } from '../queue/errors.js';
import { processImageCache } from '../images/image-cache.js';
import {
  RawMetadataLocale,
  RawMetadataLocalizationCType,
  RawMetadataAttributesCType,
  RawMetadataPropertiesCType,
  RawMetadataCType,
  RawMetadata,
} from './types.js';
import { logger } from '@stacks/api-toolkit';

const METADATA_FETCH_HTTP_AGENT = new Agent({
  headersTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
  bodyTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
  maxResponseSize: ENV.METADATA_MAX_PAYLOAD_BYTE_SIZE,
  connect: {
    rejectUnauthorized: false, // Ignore SSL cert errors.
  },
});

/**
 * A metadata URL that was analyzed and normalized into a fetchable URL. Specifies the URL, the
 * gateway type, and any extra headers that may be required to fetch the metadata.
 */
export type FetchableMetadataUrl = {
  url: URL;
  gateway: 'ipfs' | 'arweave' | null;
  fetchHeaders?: Record<string, string>;
};

/**
 * List of public IPFS gateways that will be replaced with the value of `ENV.PUBLIC_GATEWAY_IPFS`
 * whenever a metadata URL has these gateways hard coded in `http:` or `https:` URLs.
 */
const PUBLIC_GATEWAY_IPFS_REPLACED = ENV.PUBLIC_GATEWAY_IPFS_REPLACED.split(',');

/**
 * Fetches all the localized metadata JSONs for a token. First, it downloads the default metadata
 * JSON and parses it looking for other localizations. If those are found, each of them is then
 * downloaded, parsed, and returned for DB insertion.
 * @param uri - token metadata URI
 * @param contract - contract DB entry
 * @param token - token DB entry
 * @returns parsed metadata ready for insertion
 */
export async function fetchAllMetadataLocalesFromBaseUri(
  uri: string,
  contract: DbSmartContract,
  token: DbToken
): Promise<DbMetadataLocaleInsertBundle[]> {
  const tokenUri = getTokenSpecificUri(uri, token.token_number);
  let insertBundles: DbMetadataLocaleInsertBundle[] = [];

  // We'll try to fetch metadata and give it `METADATA_MAX_IMMEDIATE_URI_RETRIES` attempts
  // for the external service to return a reasonable response, otherwise we'll consider the
  // metadata as dead.
  let fetchImmediateRetryCount = 0;
  do {
    try {
      const rawMetadataLocales: RawMetadataLocale[] = [];

      const defaultMetadata = await getMetadataFromUri(
        tokenUri,
        contract.principal,
        token.token_number
      );
      rawMetadataLocales.push({
        metadata: defaultMetadata,
        default: true,
        uri: tokenUri,
      });

      // Does it declare localizations? If so, fetch and parse all of them.
      if (RawMetadataLocalizationCType.Check(defaultMetadata.localization)) {
        const uri = defaultMetadata.localization.uri;
        const locales = defaultMetadata.localization.locales;
        rawMetadataLocales[0].locale = defaultMetadata.localization.default;
        for (const locale of locales) {
          if (locale === rawMetadataLocales[0].locale) {
            // Skip the default, we already have it.
            continue;
          }
          const localeUri = getTokenSpecificUri(uri, token.token_number, locale);
          const localeMetadata = await getMetadataFromUri(
            localeUri,
            contract.principal,
            token.token_number
          );
          rawMetadataLocales.push({
            metadata: localeMetadata,
            locale: locale,
            default: false,
            uri: localeUri,
          });
        }
      }

      insertBundles = await parseMetadataForInsertion(rawMetadataLocales, contract, token);
      break;
    } catch (error) {
      fetchImmediateRetryCount++;
      if (error instanceof TooManyRequestsHttpError) {
        // 429 status codes are common when fetching metadata for thousands of tokens in the same
        // server.
        throw new RetryableJobError(`Too many requests for ${error.url}`, error);
      }
      if (
        error instanceof MetadataSizeExceededError ||
        error instanceof MetadataHttpError ||
        error instanceof MetadataParseError ||
        fetchImmediateRetryCount >= ENV.METADATA_MAX_IMMEDIATE_URI_RETRIES
      ) {
        throw error;
      }
      logger.warn(error, `MetadataFetch error for immediate retry`);
    }
  } while (fetchImmediateRetryCount < ENV.METADATA_MAX_IMMEDIATE_URI_RETRIES);

  return insertBundles;
}

/**
 * Returns a metadata URI that is specific to a token number within a contract,
 * i.e. replacing `{id}` with the token number and `{locale}` with the given
 * locale.
 * @param uri - Original metadata URI
 * @param tokenNumber - token number
 * @param locale - locale to apply
 * @returns token specific uri string
 */
export function getTokenSpecificUri(uri: string, tokenNumber: bigint, locale?: string): string {
  const tokenNumStr = tokenNumber.toString();
  const localeStr = locale ?? '';
  return (
    uri
      .replaceAll(/{id}/gi, tokenNumStr)
      .replaceAll(/{locale}/gi, localeStr)
      // Patterns below are not SIP-016 compliant.
      .replaceAll(/\$TOKEN_ID/gi, tokenNumStr)
  );
}

async function parseMetadataForInsertion(
  rawMetadataLocales: RawMetadataLocale[],
  contract: DbSmartContract,
  token: DbToken
): Promise<DbMetadataLocaleInsertBundle[]> {
  // Keep the default because we may need to fall back into its data.
  let defaultInsert: DbMetadataLocaleInsertBundle | undefined;
  const inserts: DbMetadataLocaleInsertBundle[] = [];
  for (const raw of rawMetadataLocales) {
    const metadata = raw.metadata;
    const name = metadata.name ?? defaultInsert?.metadata.name;
    if (!name) {
      // SIP-016 requires at least `sip` and `name` to be defined.
      continue;
    }
    // Process image URL with `ENV.METADATA_IMAGE_CACHE_PROCESSOR`.
    const image =
      metadata.image ??
      metadata.imageUrl ??
      metadata.image_url ??
      metadata.image_uri ??
      metadata.image_canonical_uri ??
      defaultInsert?.metadata.image ??
      null;
    let cachedImage: string | undefined;
    let cachedThumbnailImage: string | undefined;
    if (image && typeof image === 'string' && ENV.IMAGE_CACHE_PROCESSOR_ENABLED) {
      [cachedImage, cachedThumbnailImage] = await processImageCache(
        image,
        contract.principal,
        token.token_number
      );
    }
    // Localized values override defaults.
    const metadataInsert: DbMetadataInsert = {
      sip: 16,
      token_id: token.id,
      name: name.toString(),
      description:
        metadata.description?.toString() ?? defaultInsert?.metadata.description?.toString() ?? null,
      image: image ? image.toString() : null,
      cached_image: cachedImage ?? null,
      cached_thumbnail_image: cachedThumbnailImage ?? null,
      l10n_default: raw.default,
      l10n_locale: raw.locale ?? null,
      l10n_uri: raw.uri,
    };
    // Localized attributes rewrite all default attributes. No fall back.
    const attributes: DbMetadataAttributeInsert[] = [];
    if (RawMetadataAttributesCType.Check(metadata.attributes)) {
      for (const { trait_type, value, display_type } of metadata.attributes) {
        if (trait_type && value) {
          attributes.push({
            trait_type: trait_type,
            value: value,
            display_type: display_type ?? null,
          });
        }
      }
    }
    // Localized properties only override their default. All others have to fall back to default
    // values.
    const properties: DbMetadataPropertyInsert[] = defaultInsert?.properties ?? [];
    if (RawMetadataPropertiesCType.Check(metadata.properties)) {
      for (const [key, value] of Object.entries(metadata.properties)) {
        const defaultProp = properties.find(p => p.name === key);
        if (defaultProp) {
          defaultProp.value = value;
        } else {
          properties.push({
            name: key,
            value: value,
          });
        }
      }
    }
    inserts.push({
      metadata: metadataInsert,
      attributes: attributes,
      properties: properties,
    });
    if (inserts.length === 1) {
      defaultInsert = inserts[0];
    }
  }
  return inserts;
}

/**
 * Fetches metadata while monitoring timeout and size limits, hostname rate limits, etc. Throws if
 * any is reached.
 * @param httpUrl - URL to fetch
 * @returns Response text
 */
export async function fetchMetadata(
  httpUrl: URL,
  contract_principal: string,
  token_number: bigint,
  headers?: Record<string, string>
): Promise<string | undefined> {
  const url = httpUrl.toString();
  try {
    logger.info(`MetadataFetch for ${contract_principal}#${token_number} from ${url}`);
    const result = await request(url, {
      method: 'GET',
      headers,
      dispatcher:
        // Disable during tests so we can inject a global mock agent.
        process.env.NODE_ENV === 'test' ? undefined : METADATA_FETCH_HTTP_AGENT,
    });
    if (result.statusCode >= 400) {
      const responseError = new errors.ResponseError(
        result.statusText || `HTTP ${result.statusCode}`,
        result.statusCode,
        { headers: result.headers }
      );
      if (result.statusCode === 429) {
        throw new TooManyRequestsHttpError(httpUrl, responseError);
      }
      throw new MetadataHttpError(`${url}: ${result.statusCode}`, responseError);
    }
    return await result.body.text();
  } catch (error) {
    if (error instanceof TooManyRequestsHttpError || error instanceof MetadataHttpError) {
      throw error;
    } else if (
      error instanceof errors.HeadersTimeoutError ||
      error instanceof errors.BodyTimeoutError ||
      error instanceof errors.ConnectTimeoutError
    ) {
      throw new MetadataTimeoutError(new URL(url));
    } else if (error instanceof errors.ResponseExceededMaxSizeError) {
      throw new MetadataSizeExceededError(url);
    } else if (error instanceof errors.ResponseError && error.statusCode === 429) {
      throw new TooManyRequestsHttpError(httpUrl, error);
    } else if (
      error instanceof TypeError &&
      ((error as UndiciCauseTypeError).cause as { toString(): string })
        .toString()
        .includes('ECONNRESET')
    ) {
      throw new MetadataHttpError(`Server connection interrupted`, error);
    }
    throw new MetadataHttpError(`${url}: ${error}`, error);
  }
}

export async function getMetadataFromUri(
  token_uri: string,
  contract_principal: string,
  token_number: bigint
): Promise<RawMetadata> {
  // Support JSON embedded in a Data URL
  if (new URL(token_uri).protocol === 'data:') {
    const dataUrl = parseDataUrl(token_uri);
    if (!dataUrl) {
      throw new MetadataParseError(`Data URL could not be parsed: ${token_uri}`);
    }
    let content: string;
    // If media type is omitted it should default to percent-encoded `text/plain;charset=US-ASCII`
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs#syntax
    // If media type is specified but without base64 then encoding is ambiguous, so check for
    // percent-encoding or assume a literal string compatible with utf8. Because we're expecting
    // a JSON object we can reliable check for a leading `%` char, otherwise assume unescaped JSON.
    if (dataUrl.base64) {
      content = Buffer.from(dataUrl.data, 'base64').toString('utf8');
    } else if (dataUrl.data.startsWith('%')) {
      content = querystring.unescape(dataUrl.data);
    } else {
      content = dataUrl.data;
    }
    return parseJsonMetadata(token_uri, content);
  }

  // Support HTTP/S URLs otherwise.
  // Transform the URL to use a public gateway if necessary.
  const { url: httpUrl, fetchHeaders } = getFetchableMetadataUrl(token_uri);
  const urlStr = httpUrl.toString();

  // Fetch the metadata.
  const content = await fetchMetadata(httpUrl, contract_principal, token_number, fetchHeaders);
  return parseJsonMetadata(urlStr, content);
}

function parseJsonMetadata(url: string, content?: string): RawMetadata {
  if (!content) {
    throw new MetadataParseError(`Fetched metadata is blank: ${url}`);
  }
  try {
    const result = JSON5.parse(content);
    if (RawMetadataCType.Check(result)) {
      if (result.name === undefined) {
        throw new MetadataParseError(`Metadata does not contain a 'name' value: ${url}`);
      }
      return result;
    } else {
      throw new MetadataParseError(`Invalid raw metadata JSON schema: ${url}`);
    }
  } catch (error) {
    if (error instanceof MetadataParseError) throw error;
    throw new MetadataParseError(`JSON parse error: ${url}`);
  }
}

/**
 * Helper method for creating http/s url for supported protocols.
 * * URLs with `http` or `https` protocols are returned as-is. But if they are public IPFS gateways,
 *   they are replaced with `ENV.PUBLIC_GATEWAY_IPFS`.
 * * URLs with `ipfs` or `ipns` protocols are returned with as an `https` url using a public IPFS
 *   gateway.
 * * URLs with `ar` protocols are returned as `https` using a public Arweave gateway.
 * @param uri - URL to convert
 * @returns Fetchable URL
 */
export function getFetchableMetadataUrl(uri: string): FetchableMetadataUrl {
  try {
    const parsedUri = new URL(uri);
    const result: FetchableMetadataUrl = {
      url: parsedUri,
      gateway: null,
      fetchHeaders: undefined,
    };
    if (parsedUri.protocol === 'http:' || parsedUri.protocol === 'https:') {
      // If this is a known public IPFS gateway, replace it with `ENV.PUBLIC_GATEWAY_IPFS`.
      if (PUBLIC_GATEWAY_IPFS_REPLACED.includes(parsedUri.hostname)) {
        result.url = new URL(`${ENV.PUBLIC_GATEWAY_IPFS}${parsedUri.pathname}`);
        result.gateway = 'ipfs';
      } else {
        result.url = parsedUri;
      }
    } else if (parsedUri.protocol === 'ipfs:') {
      const host = parsedUri.host === 'ipfs' ? 'ipfs' : `ipfs/${parsedUri.host}`;
      result.url = new URL(`${ENV.PUBLIC_GATEWAY_IPFS}/${host}${parsedUri.pathname}`);
      result.gateway = 'ipfs';
    } else if (parsedUri.protocol === 'ipns:') {
      result.url = new URL(`${ENV.PUBLIC_GATEWAY_IPFS}/${parsedUri.host}${parsedUri.pathname}`);
      result.gateway = 'ipfs';
    } else if (parsedUri.protocol === 'ar:') {
      result.url = new URL(`${ENV.PUBLIC_GATEWAY_ARWEAVE}/${parsedUri.host}${parsedUri.pathname}`);
      result.gateway = 'arweave';
    } else {
      throw new MetadataParseError(`Unsupported uri protocol: ${uri}`);
    }

    if (result.gateway === 'ipfs' && ENV.PUBLIC_GATEWAY_IPFS_EXTRA_HEADER) {
      const [key, value] = ENV.PUBLIC_GATEWAY_IPFS_EXTRA_HEADER.split(':');
      result.fetchHeaders = {
        [key.trim()]: value.trim(),
      };
    }

    return result;
  } catch (_error) {
    throw new MetadataParseError(`Invalid uri: ${uri}`);
  }
}

export function parseDataUrl(
  s: string
):
  | { mediaType?: string; contentType?: string; charset?: string; base64: boolean; data: string }
  | false {
  try {
    const url = new URL(s);
    if (url.protocol !== 'data:') {
      return false;
    }
    const validDataUrlRegex =
      /^data:([a-z]+\/[a-z0-9-+.]+(;[a-z0-9-.!#$%*+.{}|~`]+=[a-z0-9-.!#$%*+.{}()|~`]+)*)?(;base64)?,(.*)$/i;
    const parts = validDataUrlRegex.exec(s.trim());
    if (parts === null) {
      return false;
    }
    const parsed: {
      mediaType?: string;
      contentType?: string;
      charset?: string;
      base64: boolean;
      data: string;
    } = {
      base64: false,
      data: '',
    };
    if (parts[1]) {
      parsed.mediaType = parts[1].toLowerCase();
      const mediaTypeParts = parts[1].split(';').map(x => x.toLowerCase());
      parsed.contentType = mediaTypeParts[0];
      mediaTypeParts.slice(1).forEach(attribute => {
        const p = attribute.split('=');
        Object.assign(parsed, { [p[0]]: p[1] });
      });
    }
    parsed.base64 = !!parts[parts.length - 2];
    parsed.data = parts[parts.length - 1] || '';
    return parsed;
  } catch (_e) {
    return false;
  }
}
