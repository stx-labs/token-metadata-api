import { ENV } from '../env';
import {
  DbSmartContract,
  DbJobStatus,
  DbJob,
  DbToken,
  DbProcessedTokenUpdateBundle,
  DbTokenMetadataLocaleBundle,
  DbMetadata,
  DbMetadataAttribute,
  DbMetadataProperty,
  DbMetadataLocaleBundle,
  DbRateLimitedHostInsert,
  DbRateLimitedHost,
  DbIndexPaging,
  DbFungibleTokenFilters,
  DbFungibleTokenMetadataItem,
  DbPaginatedResult,
  DbFungibleTokenOrder,
  DbJobInvalidReason,
  DbBlock,
} from './types';
import {
  ContractNotFoundError,
  InvalidContractError,
  InvalidTokenError,
  TokenLocaleNotFoundError,
  TokenNotFoundError,
  TokenNotProcessedError,
} from './errors';
import { FtOrderBy, Order } from '../api/schemas';
import {
  BasePgStore,
  PgSqlClient,
  PgSqlQuery,
  connectPostgres,
  runMigrations,
} from '@stacks/api-toolkit';
import * as path from 'path';
import { StacksCorePgStore } from './stacks-core-pg-store';

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

  async updateSmartContractTokenCount(args: { id: number; count: bigint }): Promise<void> {
    await this.sql`
      UPDATE smart_contracts SET token_count = ${args.count.toString()} WHERE id = ${args.id}
    `;
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
   * Writes a full bundle of token info and metadata (including attributes and properties) into the
   * db.
   * @param id - token id
   * @param values - update bundle values
   */
  async updateProcessedTokenWithMetadata(args: {
    id: number;
    values: DbProcessedTokenUpdateBundle;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Update token and clear old metadata (this will cascade into all properties and attributes)
      const tokenUpdate = await sql`
        UPDATE tokens SET ${sql(args.values.token)}, updated_at = NOW() WHERE id = ${args.id}
      `;
      if (tokenUpdate.count === 0) return;
      await sql`DELETE FROM metadata WHERE token_id = ${args.id}`;
      // Write new metadata
      if (args.values.metadataLocales && args.values.metadataLocales.length > 0) {
        for (const locale of args.values.metadataLocales) {
          const metadataInsert = await sql<{ id: number }[]>`
            INSERT INTO metadata ${sql(locale.metadata)} RETURNING id
          `;
          const metadataId = metadataInsert[0].id;
          if (locale.attributes && locale.attributes.length > 0) {
            const values = locale.attributes.map(attribute => ({
              ...attribute,
              metadata_id: metadataId,
            }));
            await sql`INSERT INTO metadata_attributes ${sql(values)}`;
          }
          if (locale.properties && locale.properties.length > 0) {
            const values = locale.properties.map(property => ({
              name: property.name,
              value:
                typeof property.value == 'boolean'
                  ? sql`TO_JSONB(${property.value})`
                  : property.value,
              metadata_id: metadataId,
            }));
            await sql`INSERT INTO metadata_properties ${sql(values)}`;
          }
        }
      }
    });
  }

  async updateTokenSupply(args: { id: number; total_supply: string }): Promise<void> {
    await this.sql`
      UPDATE tokens SET total_supply = ${args.total_supply} WHERE id = ${args.id}
    `;
  }

  async updateJobStatus(args: {
    id: number;
    status: DbJobStatus;
    invalidReason?: DbJobInvalidReason;
  }): Promise<void> {
    await this.sql`
      UPDATE jobs
      SET status = ${args.status},
        invalid_reason = ${
          args.status == DbJobStatus.invalid && args.invalidReason
            ? args.invalidReason
            : this.sql`NULL`
        },
        ${
          args.status != DbJobStatus.pending
            ? this.sql`retry_count = 0, retry_after = NULL,`
            : this.sql``
        }
        updated_at = NOW()
      WHERE id = ${args.id}
    `;
  }

  async retryAllFailedJobs(): Promise<void> {
    await this.sql`
      UPDATE jobs
      SET status = ${DbJobStatus.pending}, retry_count = 0, updated_at = NOW(), retry_after = NULL
      WHERE status IN (${DbJobStatus.failed}, ${DbJobStatus.invalid})
    `;
  }

  async increaseJobRetryCount(args: { id: number; retry_after: number }): Promise<number> {
    const retryAfter = args.retry_after.toString();
    const result = await this.sql<{ retry_count: number }[]>`
      UPDATE jobs
      SET retry_count = retry_count + 1,
        updated_at = NOW(),
        retry_after = NOW() + INTERVAL '${this.sql(retryAfter)} ms'
      WHERE id = ${args.id}
      RETURNING retry_count
    `;
    return result[0].retry_count;
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

  async insertRateLimitedHost(args: {
    values: DbRateLimitedHostInsert;
  }): Promise<DbRateLimitedHost> {
    const retryAfter = args.values.retry_after.toString();
    const results = await this.sql<DbRateLimitedHost[]>`
      INSERT INTO rate_limited_hosts (hostname, created_at, retry_after)
      VALUES (${args.values.hostname}, DEFAULT, NOW() + INTERVAL '${this.sql(retryAfter)} seconds')
      ON CONFLICT ON CONSTRAINT rate_limited_hosts_hostname_key DO
        UPDATE SET retry_after = EXCLUDED.retry_after
      RETURNING *
    `;
    return results[0];
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

  async deleteRateLimitedHost(args: { hostname: string }): Promise<void> {
    await this.sql`
      DELETE FROM rate_limited_hosts WHERE hostname = ${args.hostname}
    `;
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
        WHERE t.type = 'ft' AND canonical = true
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

  async updateTokenCachedImages(
    tokenId: number,
    cachedImage: string,
    cachedThumbnailImage: string
  ): Promise<void> {
    await this.sql`
      WITH token_date AS (
        UPDATE tokens SET updated_at = NOW() WHERE id = ${tokenId}
      )
      UPDATE metadata
      SET cached_image = ${cachedImage}, cached_thumbnail_image = ${cachedThumbnailImage}
      WHERE token_id = ${tokenId}
    `;
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
    const status = tokenJobStatus[0].status;
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
