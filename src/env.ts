import { Static, Type } from '@sinclair/typebox';
import envSchema from 'env-schema';

const schema = Type.Object({
  /**
   * Run mode for this service. Allows you to control how the Token Metadata Service runs, typically
   * in an auto-scaled environment. Available values are:
   * * `default`: Runs background jobs and the REST API server (this is the default)
   * * `writeonly`: Runs only background jobs
   * * `readonly`: Runs only the REST API server
   */
  RUN_MODE: Type.Enum(
    { default: 'default', readonly: 'readonly', writeonly: 'writeonly' },
    { default: 'default' }
  ),
  /** Specifies which Stacks network this API is indexing */
  NETWORK: Type.Enum({ mainnet: 'mainnet', testnet: 'testnet' }, { default: 'mainnet' }),
  /** Hosname of the Token Metadata API server */
  API_HOST: Type.String({ default: '0.0.0.0' }),
  /** Port in which to serve the API */
  API_PORT: Type.Number({ default: 3000, minimum: 0, maximum: 65535 }),
  /** Port in which to serve the Admin RPC interface */
  ADMIN_RPC_PORT: Type.Number({ default: 3001, minimum: 0, maximum: 65535 }),
  /** Port in which to receive chainhook events */
  EVENT_PORT: Type.Number({ default: 3099, minimum: 0, maximum: 65535 }),
  /** Event server body limit (bytes) */
  EVENT_SERVER_BODY_LIMIT: Type.Integer({ default: 20971520 }),
  /** Hostname that will be reported to the chainhook node so it can call us back with events */
  EXTERNAL_HOSTNAME: Type.String({ default: '127.0.0.1' }),
  /** Port in which to serve prometheus metrics */
  PROMETHEUS_PORT: Type.Number({ default: 9153 }),
  /** Port in which to serve the profiler */
  PROFILER_PORT: Type.Number({ default: 9119 }),

  /** Hostname of the chainhook node we'll use to register predicates */
  CHAINHOOK_NODE_RPC_HOST: Type.String({ default: '127.0.0.1' }),
  /** Control port of the chainhook node */
  CHAINHOOK_NODE_RPC_PORT: Type.Number({ default: 20456, minimum: 0, maximum: 65535 }),
  /**
   * Authorization token that the chainhook node must send with every event to make sure it's
   * coming from the valid instance
   */
  CHAINHOOK_NODE_AUTH_TOKEN: Type.String(),
  /**
   * Register chainhook predicates automatically when the API is first launched. Set this to `false`
   * if you're configuring your predicates manually.
   */
  CHAINHOOK_AUTO_PREDICATE_REGISTRATION: Type.Boolean({ default: true }),
  /**
   * File path to a directory where the `predicate.json` file will be persisted by the API when
   * registering its chainhook predicate so it can validate and resume later. Only used if auto
   * predicate registration is enabled.
   */
  CHAINHOOK_PREDICATE_PATH: Type.String({ default: '.' }),

  PGHOST: Type.String(),
  PGPORT: Type.Number({ default: 5432, minimum: 0, maximum: 65535 }),
  PGUSER: Type.String(),
  PGPASSWORD: Type.String(),
  PGDATABASE: Type.String(),
  /** Limit to how many concurrent connections can be created */
  PG_CONNECTION_POOL_MAX: Type.Number({ default: 10 }),
  PG_IDLE_TIMEOUT: Type.Number({ default: 30 }),
  PG_MAX_LIFETIME: Type.Number({ default: 60 }),
  PG_CLOSE_TIMEOUT: Type.Number({ default: 10 }),

  STACKS_NODE_RPC_HOST: Type.String(),
  STACKS_NODE_RPC_PORT: Type.Number({ minimum: 0, maximum: 65535 }),

  /// Base url for the Stacks API. Used only through AdminRPC requests for maintenance operations.
  STACKS_API_BASE_URL: Type.String({ default: 'https://api.mainnet.hiro.so' }),

  /** Whether or not the job queue should start processing jobs immediately after bootup. */
  JOB_QUEUE_AUTO_START: Type.Boolean({ default: true }),
  /** Whether or not the `JobQueue` will continue to try retryable failed jobs indefinitely. */
  JOB_QUEUE_STRICT_MODE: Type.Boolean({ default: false }),
  /**
   * How many times a job will be retried if its failure is recoverable. This setting is ignored if
   * `JOB_QUEUE_STRICT_MODE` is enabled.
   */
  JOB_QUEUE_MAX_RETRIES: Type.Number({ default: 10 }),
  /** How many jobs will be processed at the same time in the `JobQueue`. */
  JOB_QUEUE_CONCURRENCY_LIMIT: Type.Number({ default: 5 }),
  /**
   * The maximum number of jobs that will be loaded into memory when fetching them from the
   * database.
   */
  JOB_QUEUE_SIZE_LIMIT: Type.Number({ default: 200 }),
  /** Maximum time a job will run before marking it as failed. */
  JOB_QUEUE_TIMEOUT_MS: Type.Number({ default: 60_000 }),
  /** Minimum time we will wait to retry a job after it's been executed. */
  JOB_QUEUE_RETRY_AFTER_MS: Type.Number({ default: 5_000 }),

  /**
   * The max number of immediate attempts that will be made to retrieve metadata from external URIs
   * before declaring the failure as a non-retryable error.
   */
  METADATA_MAX_IMMEDIATE_URI_RETRIES: Type.Number({ default: 3 }),
  /**
   * Timeout period for a token metadata URL fetch in milliseconds. You should not make this
   * timeout very short as usually IPFS and other gateways take a few seconds to respond with the
   * requested resource. Defaults to 30 seconds.
   */
  METADATA_FETCH_TIMEOUT_MS: Type.Number({ default: 30_000 }),
  /**
   * The maximum number of bytes of metadata to fetch. If the fetch encounters more bytes than this
   * limit it throws and the metadata is not processed.
   */
  METADATA_MAX_PAYLOAD_BYTE_SIZE: Type.Number({ default: 1_000_000 }), // 1 MB
  /**
   * Upper limit on the number of NFTs a contract may declare. Tune this number to guard against
   * test contracts that may define a ridiculous amount of tokens which could cause a denial of
   * service in our token queue. Defaults to 50,000.
   */
  METADATA_MAX_NFT_CONTRACT_TOKEN_COUNT: Type.Number({ default: 50_000 }),
  /**
   * How often will token metadata that is marked `dynamic` will be refreshed if it doesn't specify
   * an explicit TTL (seconds). See SIP-019 for more information. Defaults to 86400 seconds (24
   * hours).
   */
  METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL: Type.Number({ default: 86_400 }), // 24 hours
  /**
   * Time that must elapse between a 429 'Too many requests' response returned by a hostname and the
   * next request that is sent to it (seconds). This value will be overridden by the `Retry-After`
   * header returned by the domain, if any.
   */
  METADATA_RATE_LIMITED_HOST_RETRY_AFTER: Type.Number({ default: 60 }), // 1 minute
  /**
   * Maximum number of HTTP redirections to follow when fetching metadata. Defaults to 5.
   */
  METADATA_FETCH_MAX_REDIRECTIONS: Type.Number({ default: 5 }),

  /**
   * Base URL for a public gateway which will provide access to all IPFS resources when metadata
   * URLs use the `ipfs:` or `ipns:` protocol schemes. Defaults to `https://cloudflare-ipfs.com`.
   */
  PUBLIC_GATEWAY_IPFS: Type.String({ default: 'https://cloudflare-ipfs.com' }),
  /**
   * Extra header key to add to the request when fetching metadata from the configured IPFS gateway,
   * for example if authentication is required. Must be in the form 'Header: Value'.
   */
  PUBLIC_GATEWAY_IPFS_EXTRA_HEADER: Type.Optional(Type.String()),
  /**
   * List of public IPFS gateways that will be replaced with the value of `PUBLIC_GATEWAY_IPFS`
   * whenever a metadata URL has these gateways hard coded in `http:` or `https:` URLs.
   */
  PUBLIC_GATEWAY_IPFS_REPLACED: Type.String({
    default: 'ipfs.io,dweb.link,gateway.pinata.cloud,cloudflare-ipfs.com,infura-ipfs.io',
  }),

  /**
   * Base URL for a public gateway which will provide access to all Arweave resources when metadata
   * URLs use the `ar:` protocol scheme. Defaults to
   * `https://arweave.net`.
   */
  PUBLIC_GATEWAY_ARWEAVE: Type.String({ default: 'https://arweave.net' }),

  /** Enables token image uploads to a Google Cloud Storage bucket. */
  IMAGE_CACHE_PROCESSOR_ENABLED: Type.Boolean({ default: false }),
  /** Width to resize images into while preserving aspect ratio. */
  IMAGE_CACHE_RESIZE_WIDTH: Type.Integer({ default: 300 }),
  /** Google Cloud Storage bucket name. Example: 'assets.dev.hiro.so' */
  IMAGE_CACHE_GCS_BUCKET_NAME: Type.Optional(Type.String()),
  /** Path for object storage inside the bucket. Example: 'token-metadata-api/mainnet/' */
  IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX: Type.Optional(Type.String()),
  /**
   * Base path for URLs that will be returned to the API for storage. Example:
   * 'https://assets.dev.hiro.so/token-metadata-api/mainnet/'
   */
  IMAGE_CACHE_CDN_BASE_PATH: Type.Optional(Type.String()),
  /** Max payload size accepted when downloading remote images. */
  IMAGE_CACHE_MAX_BYTE_SIZE: Type.Optional(Type.Integer()),
});
type Env = Static<typeof schema>;

export const ENV = envSchema<Env>({
  schema: schema,
  dotenv: true,
});
