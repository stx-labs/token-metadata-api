import { ENV } from '../env.js';
import {
  DbSmartContract,
  DbJobStatus,
  DbJob,
  DbToken,
  DbTokenMetadataLocaleBundle,
  DbMetadata,
  DbMetadataAttribute,
  DbMetadataProperty,
  DbMetadataLocaleBundle,
  DbRateLimitedHost,
  DbIndexPaging,
  DbFungibleTokenFilters,
  DbFungibleTokenMetadataItem,
  DbBulkTokenMetadataItem,
  DbPaginatedResult,
  DbFungibleTokenOrder,
  DbJobInvalidReason,
  DbBlock,
} from './types.js';
import {
  ContractNotFoundError,
  InvalidContractError,
  InvalidTokenError,
  TokenLocaleNotFoundError,
  TokenNotFoundError,
  TokenNotProcessedError,
} from './errors.js';
import { FtOrderBy, Order } from '../api/schemas.js';
import {
  BasePgStore,
  PgSqlClient,
  PgSqlQuery,
  connectPostgres,
  runMigrations,
} from '@stacks/api-toolkit';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { StacksCorePgStore } from './stacks-core-pg-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

/**
 * Connects and queries the Token Metadata Service's local postgres DB.
 */
export class PgStore extends BasePgStore {
  readonly core: StacksCorePgStore;

  static async connect(opts?: { skipMigrations: boolean }): Promise<PgStore> {
    const pgConfig = {
      host: ENV.PGHOST,
      port: ENV.PGPORT,
      user: ENV.PGUSER,
      password: ENV.PGPASSWORD,
      database: ENV.PGDATABASE,
    };
    const sql = await connectPostgres({
      usageName: 'tms-pg-store',
      connectionArgs: pgConfig,
      connectionConfig: {
        poolMax: ENV.PG_CONNECTION_POOL_MAX,
        idleTimeout: ENV.PG_IDLE_TIMEOUT,
        maxLifetime: ENV.PG_MAX_LIFETIME,
      },
    });
    if (opts?.skipMigrations !== true) {
      await runMigrations(MIGRATIONS_DIR, 'up');
    }
    return new PgStore(sql);
  }

  constructor(sql: PgSqlClient) {
    super(sql);
    this.core = new StacksCorePgStore(this);
  }

  async getChainTip(): Promise<DbBlock | null> {
    return this.core.getChainTip(this.sql);
  }

  async getSmartContract(
    args: { id: number } | { principal: string }
  ): Promise<DbSmartContract | undefined> {
    const result = await this.sql<DbSmartContract[]>`
      SELECT *
      FROM smart_contracts
      WHERE ${'id' in args ? this.sql`id = ${args.id}` : this.sql`principal = ${args.principal}`}
        AND canonical = true
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0];
  }

  async getToken(args: { id: number }): Promise<DbToken | undefined> {
    const result = await this.sql<DbToken[]>`
      SELECT * FROM tokens WHERE id = ${args.id} AND canonical = true
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0];
  }

  async getTokenMetadataBundle(args: {
    contractPrincipal: string;
    tokenNumber: number;
    locale?: string;
  }): Promise<DbTokenMetadataLocaleBundle> {
    return await this.sqlTransaction(async sql => {
      // Is the contract invalid?
      const contractJobStatus = await sql<
        { status: DbJobStatus; invalid_reason: DbJobInvalidReason }[]
      >`
        SELECT status, invalid_reason
        FROM jobs
        INNER JOIN smart_contracts ON jobs.smart_contract_id = smart_contracts.id
        WHERE smart_contracts.principal = ${args.contractPrincipal}
          AND smart_contracts.canonical = true
      `;
      if (contractJobStatus.count === 0) {
        throw new ContractNotFoundError();
      }
      if (contractJobStatus[0].status === DbJobStatus.invalid) {
        throw new InvalidContractError(contractJobStatus[0].invalid_reason);
      }
      // Get token id
      const tokenIdRes = await sql<{ id: number }[]>`
        SELECT tokens.id
        FROM tokens
        INNER JOIN smart_contracts ON tokens.smart_contract_id = smart_contracts.id
        WHERE smart_contracts.principal = ${args.contractPrincipal}
          AND tokens.token_number = ${args.tokenNumber}
          AND tokens.canonical = true
      `;
      if (tokenIdRes.count === 0) {
        throw new TokenNotFoundError();
      }
      const tokenId = tokenIdRes[0].id;
      // Is the locale valid?
      if (args.locale && !(await this.isTokenLocaleAvailable(tokenId, args.locale))) {
        throw new TokenLocaleNotFoundError();
      }
      // Get metadata
      return await this.getTokenMetadataBundleInternal(
        tokenId,
        args.contractPrincipal,
        args.locale
      );
    });
  }

  /**
   * Retrieves a number of pending jobs so they can be processed immediately.
   * @param limit - number of jobs to retrieve
   * @returns `DbJob[]`
   */
  async getPendingJobBatch(args: { limit: number }): Promise<DbJob[]> {
    return this.sql<DbJob[]>`
      SELECT * FROM jobs
      WHERE status = 'pending' AND (retry_after IS NULL OR retry_after < NOW())
      ORDER BY COALESCE(updated_at, created_at) ASC
      LIMIT ${args.limit}
    `;
  }

  /**
   * Gets jobs marked as `queued` in the database.
   * @returns `DbJob[]`
   */
  async getQueuedJobs(args: { excludingIds: number[] }): Promise<DbJob[]> {
    return this.sql<DbJob[]>`
      SELECT * FROM jobs
      WHERE status = 'queued'
      ${
        args.excludingIds.length
          ? this.sql`AND id NOT IN ${this.sql(args.excludingIds)}`
          : this.sql``
      }
      ORDER BY updated_at ASC
    `;
  }

  async getJob(args: { id: number }): Promise<DbJob | undefined> {
    const result = await this.sql<DbJob[]>`
      SELECT * FROM jobs WHERE id = ${args.id}
    `;
    if (result.count) {
      return result[0];
    }
  }

  /**
   * Returns a token ETag based on its last updated date.
   * @param contractPrincipal - smart contract principal
   * @param tokenNumber - token number
   * @returns ETag
   */
  async getTokenEtag(args: {
    contractPrincipal: string;
    tokenNumber: bigint;
  }): Promise<string | undefined> {
    const result = await this.sql<{ etag: string }[]>`
      SELECT date_part('epoch', t.updated_at)::text AS etag
      FROM tokens AS t
      INNER JOIN smart_contracts AS s ON s.id = t.smart_contract_id
      WHERE s.principal = ${args.contractPrincipal}
      AND t.token_number = ${args.tokenNumber}
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0].etag;
  }

  async getJobStatusCounts(): Promise<{ count: number; status: string }[]> {
    return this.sql<{ count: number; status: string }[]>`
      SELECT COUNT(*)::int, status FROM jobs GROUP BY status
    `;
  }

  async getSmartContractCounts(): Promise<{ count: number; sip: string }[]> {
    return this.sql<{ count: number; sip: string }[]>`
      SELECT COUNT(*)::int, sip FROM smart_contracts WHERE canonical = true GROUP BY sip
    `;
  }

  async getTokenCounts(): Promise<{ count: number; type: string }[]> {
    return this.sql<{ count: number; type: string }[]>`
      SELECT COUNT(*)::int, type FROM tokens WHERE canonical = true GROUP BY type
    `;
  }

  async getRateLimitedHost(args: { hostname: string }): Promise<DbRateLimitedHost | undefined> {
    const results = await this.sql<DbRateLimitedHost[]>`
      SELECT *
      FROM rate_limited_hosts
      WHERE hostname = ${args.hostname}
    `;
    if (results.count > 0) {
      return results[0];
    }
  }

  async getFungibleTokens(args: {
    page: DbIndexPaging;
    filters?: DbFungibleTokenFilters;
    order?: DbFungibleTokenOrder;
  }): Promise<DbPaginatedResult<DbFungibleTokenMetadataItem>> {
    return await this.sqlTransaction(async sql => {
      const validMetadataOnly = args.filters?.valid_metadata_only ?? false;
      // `ORDER BY` statement
      let orderBy: PgSqlQuery;
      switch (args.order?.order_by) {
        case FtOrderBy.symbol:
          orderBy = sql`LOWER(t.symbol)`;
          break;
        default:
          orderBy = sql`LOWER(t.name)`;
          break;
      }
      // `ORDER` statement
      const order = args.order?.order === Order.asc ? sql`ASC` : sql`DESC`;
      const results = await sql<({ total: number } & DbFungibleTokenMetadataItem)[]>`
        SELECT
          t.name,
          t.symbol,
          t.decimals,
          t.total_supply,
          t.uri,
          m.description,
          s.principal,
          s.tx_id,
          s.fungible_token_name,
          m.image,
          m.cached_image,
          COUNT(*) OVER() as total
        FROM tokens AS t
        ${validMetadataOnly ? sql`INNER` : sql`LEFT`} JOIN metadata AS m ON t.id = m.token_id
        INNER JOIN smart_contracts AS s ON t.smart_contract_id = s.id
        WHERE t.type = 'ft' AND t.canonical = true
          ${
            args.filters?.name
              ? sql`AND LOWER(t.name) LIKE '%' || LOWER(${args.filters.name}) || '%'`
              : sql``
          }
          ${args.filters?.symbol ? sql`AND LOWER(t.symbol) = LOWER(${args.filters.symbol})` : sql``}
          ${
            args.filters?.address ? sql`AND s.principal LIKE ${args.filters.address} || '%'` : sql``
          }
        ORDER BY ${orderBy} ${order}
        LIMIT ${args.page.limit}
        OFFSET ${args.page.offset}
      `;
      return {
        total: results[0]?.total ?? 0,
        results: results ?? [],
      };
    });
  }

  async getTokenImageUris(
    contractPrincipal: string,
    tokenNumbers?: number[]
  ): Promise<{ token_id: number; token_number: string; image: string }[]> {
    return await this.sqlTransaction(async sql => {
      return await sql<{ token_id: number; token_number: string; image: string }[]>`
        SELECT m.token_id, t.token_number, m.image
        FROM metadata AS m
        INNER JOIN tokens AS t ON m.token_id = t.id
        INNER JOIN smart_contracts AS c ON t.smart_contract_id = c.id
        WHERE m.image IS NOT NULL
          AND c.principal = ${contractPrincipal}
          ${tokenNumbers ? sql`AND t.token_number IN ${sql(tokenNumbers)}` : sql``}
      `;
    });
  }

  async getBulkTokenMetadata(args: {
    pairs: { principal: string; tokenNumber: number }[];
    locale?: string;
  }): Promise<DbBulkTokenMetadataItem[]> {
    if (args.pairs.length === 0) return [];
    const principals = args.pairs.map(p => p.principal);
    const tokenNumbers = args.pairs.map(p => p.tokenNumber);
    return this.sql<DbBulkTokenMetadataItem[]>`
      WITH search_pairs AS (
        SELECT unnest(${principals}::text[]) AS principal,
               unnest(${tokenNumbers}::bigint[]) AS token_number
      )
      SELECT
        s.principal,
        t.token_number,
        t.type AS token_type,
        t.name,
        t.symbol,
        t.decimals,
        t.total_supply,
        t.uri,
        s.tx_id,
        m.description,
        m.image,
        m.cached_image,
        m.cached_thumbnail_image
      FROM search_pairs sp
      INNER JOIN smart_contracts s ON s.principal = sp.principal AND s.canonical = true
      INNER JOIN tokens t ON t.smart_contract_id = s.id
        AND t.token_number = sp.token_number AND t.canonical = true
      LEFT JOIN metadata m ON t.id = m.token_id
        AND ${
          args.locale ? this.sql`m.l10n_locale = ${args.locale}` : this.sql`m.l10n_default = true`
        }
    `;
  }

  async getBulkTokensEtag(args: {
    pairs: { principal: string; tokenNumber: number }[];
  }): Promise<string | undefined> {
    if (args.pairs.length === 0) return undefined;
    const principals = args.pairs.map(p => p.principal);
    const tokenNumbers = args.pairs.map(p => p.tokenNumber);
    const result = await this.sql<{ etag: string }[]>`
      WITH search_pairs AS (
        SELECT unnest(${principals}::text[]) AS principal,
               unnest(${tokenNumbers}::bigint[]) AS token_number
      )
      SELECT MAX(date_part('epoch', t.updated_at))::text AS etag
      FROM search_pairs sp
      INNER JOIN smart_contracts s ON s.principal = sp.principal AND s.canonical = true
      INNER JOIN tokens t ON t.smart_contract_id = s.id
        AND t.token_number = sp.token_number AND t.canonical = true
    `;
    if (result.count === 0 || !result[0].etag) return undefined;
    return result[0].etag;
  }

  private async isTokenLocaleAvailable(tokenId: number, locale: string): Promise<boolean> {
    const tokenLocale = await this.sql<{ id: number }[]>`
      SELECT id FROM metadata
      WHERE token_id = ${tokenId}
      AND l10n_locale = ${locale}
    `;
    return tokenLocale.count !== 0;
  }

  private async getTokenMetadataBundleInternal(
    tokenId: number,
    smartContractPrincipal: string,
    locale?: string
  ): Promise<DbTokenMetadataLocaleBundle> {
    // Is token invalid?
    const tokenJobStatus = await this.sql<{ status: string; invalid_reason: DbJobInvalidReason }[]>`
      SELECT status, invalid_reason FROM jobs WHERE token_id = ${tokenId}
    `;
    if (tokenJobStatus.count === 0) {
      throw new TokenNotFoundError();
    }
    const status = tokenJobStatus[0].status as DbJobStatus;
    if (status === DbJobStatus.invalid) {
      throw new InvalidTokenError(tokenJobStatus[0].invalid_reason);
    }
    // Get token
    const tokenRes = await this.sql<DbToken[]>`
      SELECT * FROM tokens WHERE id = ${tokenId} AND canonical = true
    `;
    const token = tokenRes[0];
    // Is it still waiting to be processed?
    if (!token.updated_at && (status === DbJobStatus.queued || status === DbJobStatus.pending)) {
      throw new TokenNotProcessedError();
    }
    // Get metadata
    let localeBundle: DbMetadataLocaleBundle | undefined;
    const metadataRes = await this.sql<DbMetadata[]>`
      SELECT * FROM metadata
      WHERE token_id = ${token.id}
      AND ${locale ? this.sql`l10n_locale = ${locale}` : this.sql`l10n_default = TRUE`}
    `;
    if (metadataRes.count > 0) {
      const attributes = await this.sql<DbMetadataAttribute[]>`
        SELECT * FROM metadata_attributes WHERE metadata_id = ${metadataRes[0].id}
      `;
      const properties = await this.sql<DbMetadataProperty[]>`
        SELECT * FROM metadata_properties WHERE metadata_id = ${metadataRes[0].id}
      `;
      localeBundle = {
        metadata: metadataRes[0],
        attributes: attributes,
        properties: properties,
      };
    }
    const smartContract = await this.getSmartContract({ principal: smartContractPrincipal });
    if (!smartContract) {
      throw new ContractNotFoundError();
    }
    return {
      token,
      smartContract,
      metadataLocale: localeBundle,
    };
  }
}
