import {
  BasePgStoreModule,
  PgSqlClient,
  batchIterate,
  logger,
  stopwatch,
} from '@hirosystems/api-toolkit';
import { ENV } from '../env';
import {
  NftMintEvent,
  SmartContractDeployment,
  TokenMetadataUpdateNotification,
} from '../token-processor/util/sip-validation';
import { DbSmartContractInsert, DbTokenType, DbSmartContract, DbSipNumber } from './types';
import { dbSipNumberToDbTokenType } from '../token-processor/util/helpers';
import BigNumber from 'bignumber.js';
import { SnpProcessedBlock, SnpProcessedEvent } from '../snp/snp-block-processor';

export class SnpPgStore extends BasePgStoreModule {
  async writeBlock(block: SnpProcessedBlock): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      logger.info(`ChainhookPgStore apply block ${block.block_height} #${block.index_block_hash}`);
      const time = stopwatch();
      await this.applyTransactions(sql, block);
      await this.enqueueDynamicTokensDueForRefresh();
      await this.updateChainTipBlockHeight(block.block_height);
      logger.info(
        `ChainhookPgStore apply block ${block.block_height} #${
          block.index_block_hash
        } finished in ${time.getElapsedSeconds()}s`
      );
    });
  }

  /**
   * Inserts new tokens and new token queue entries until `token_count` items are created, usually
   * used when processing an NFT contract that has just been deployed.
   */
  async insertAndEnqueueSequentialTokens(
    sql: PgSqlClient,
    args: {
      smart_contract: DbSmartContract;
      token_count: bigint;
    }
  ): Promise<void> {
    const tokenValues = [];
    for (let index = 1; index <= args.token_count; index++)
      tokenValues.push({
        smart_contract_id: args.smart_contract.id,
        token_number: index.toString(),
        type: dbSipNumberToDbTokenType(args.smart_contract.sip),
        block_height: args.smart_contract.block_height,
        index_block_hash: args.smart_contract.index_block_hash,
        tx_id: args.smart_contract.tx_id,
        tx_index: args.smart_contract.tx_index,
      });
    for await (const batch of batchIterate(tokenValues, 500)) {
      await sql`
        WITH token_inserts AS (
          INSERT INTO tokens ${sql(batch)}
          ON CONFLICT ON CONSTRAINT tokens_smart_contract_id_token_number_unique DO
            UPDATE SET
              uri = EXCLUDED.uri,
              name = EXCLUDED.name,
              symbol = EXCLUDED.symbol,
              decimals = EXCLUDED.decimals,
              total_supply = EXCLUDED.total_supply,
              updated_at = NOW()
          RETURNING id
        )
        INSERT INTO jobs (token_id) (SELECT id AS token_id FROM token_inserts)
        ON CONFLICT (token_id) WHERE smart_contract_id IS NULL DO
          UPDATE SET updated_at = NOW(), status = 'pending'
      `;
    }
  }

  async applyContractDeployment(
    sql: PgSqlClient,
    contract: SnpProcessedEvent<SmartContractDeployment>,
    block: SnpProcessedBlock
  ) {
    await this.enqueueContract(sql, {
      principal: contract.event.principal,
      sip: contract.event.sip,
      block_height: block.block_height,
      index_block_hash: block.index_block_hash,
      tx_id: contract.tx_id,
      tx_index: contract.tx_index,
      fungible_token_name: contract.event.fungible_token_name ?? null,
      non_fungible_token_name: contract.event.non_fungible_token_name ?? null,
    });
  }

  async enqueueContract(
    sql: PgSqlClient,
    contract: {
      block_height: number;
      index_block_hash: string;
      principal: string;
      sip: DbSipNumber;
      tx_id: string;
      tx_index: number;
      fungible_token_name: string | null;
      non_fungible_token_name: string | null;
    }
  ) {
    const values: DbSmartContractInsert = {
      principal: contract.principal,
      sip: contract.sip,
      block_height: contract.block_height,
      index_block_hash: contract.index_block_hash,
      tx_id: contract.tx_id,
      tx_index: contract.tx_index,
      fungible_token_name: contract.fungible_token_name,
      non_fungible_token_name: contract.non_fungible_token_name,
    };
    await sql`
      WITH smart_contract_inserts AS (
        INSERT INTO smart_contracts ${sql(values)}
        ON CONFLICT ON CONSTRAINT smart_contracts_principal_key DO UPDATE SET updated_at = NOW()
        RETURNING id
      )
      INSERT INTO jobs (smart_contract_id)
        (SELECT id AS smart_contract_id FROM smart_contract_inserts)
      ON CONFLICT (smart_contract_id) WHERE token_id IS NULL DO
        UPDATE SET updated_at = NOW(), status = 'pending'
    `;
    logger.info(
      `ChainhookPgStore apply contract deploy ${contract.principal} (${contract.sip}) at block ${contract.block_height}`
    );
  }

  async updateChainTipBlockHeight(blockHeight: number): Promise<void> {
    await this.sql`UPDATE chain_tip SET block_height = ${blockHeight}`;
  }

  private async getLastIngestedBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: number }[]>`SELECT block_height FROM chain_tip`;
    return result[0].block_height;
  }

  private async applyTransactions(sql: PgSqlClient, block: SnpProcessedBlock) {
    for (const contract of block.contracts)
      await this.applyContractDeployment(sql, contract, block);
    for (const notification of block.notifications)
      await this.applyNotification(sql, notification, block);
    await this.applyTokenMints(sql, block.nftMints, DbTokenType.nft, block);
    await this.applyTokenMints(sql, block.sftMints, DbTokenType.sft, block);
    for (const [contract, delta] of block.ftSupplyDelta)
      await this.applyFtSupplyChange(sql, contract, delta, block);
  }

  // private async rollBackTransactions(sql: PgSqlClient, cache: BlockCache) {
  //   for (const contract of cache.contracts)
  //     await this.rollBackContractDeployment(sql, contract, cache);
  //   for (const notification of cache.notifications)
  //     await this.rollBackNotification(sql, notification, cache);
  //   await this.rollBackTokenMints(sql, cache.nftMints, DbTokenType.nft, cache);
  //   await this.rollBackTokenMints(sql, cache.sftMints, DbTokenType.sft, cache);
  //   for (const [contract, delta] of cache.ftSupplyDelta)
  //     await this.applyFtSupplyChange(sql, contract, delta.negated(), cache);
  // }

  private async applyNotification(
    sql: PgSqlClient,
    event: SnpProcessedEvent<TokenMetadataUpdateNotification>,
    block: SnpProcessedBlock
  ) {
    const contractResult = await sql<{ id: number }[]>`
      SELECT id FROM smart_contracts WHERE principal = ${event.event.contract_id} LIMIT 1
    `;
    if (contractResult.count == 0) {
      logger.warn(
        `ChainhookPgStore found SIP-019 notification for non-existing token contract ${event.event.contract_id} at block ${block.block_height} #${block.index_block_hash}`
      );
      return;
    }
    const notification = event.event;
    await sql`
      WITH affected_token_ids AS (
        SELECT t.id
        FROM tokens AS t
        INNER JOIN smart_contracts AS s ON s.id = t.smart_contract_id
        WHERE s.principal = ${notification.contract_id}
        ${
          notification.token_ids?.length
            ? sql`AND t.token_number IN ${sql(notification.token_ids)}`
            : sql``
        }
      ),
      previous_modes AS (
        SELECT DISTINCT ON (a.id) a.id, COALESCE(m.update_mode, 'standard') AS update_mode
        FROM affected_token_ids AS a
        LEFT JOIN update_notifications AS m ON a.id = m.token_id
        ORDER BY a.id, m.block_height DESC, m.tx_index DESC, m.event_index DESC
      ),
      new_mode_inserts AS (
        INSERT INTO update_notifications
        (token_id, update_mode, ttl, block_height, index_block_hash, tx_id, tx_index, event_index)
        (
          SELECT id, ${notification.update_mode}, ${notification.ttl ?? null},
            ${block.block_height}, ${block.index_block_hash}, ${event.tx_id}, ${event.tx_index},
            ${event.event_index}
          FROM previous_modes
          WHERE update_mode <> 'frozen'
        )
        RETURNING token_id
      )
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE token_id IN (SELECT token_id FROM new_mode_inserts)
    `;
    logger.info(
      `ChainhookPgStore apply SIP-019 notification ${notification.contract_id} (${
        notification.token_ids ?? 'all'
      }) at block ${block.block_height} #${block.index_block_hash}`
    );
  }

  private async applyFtSupplyChange(
    sql: PgSqlClient,
    contract: string,
    delta: BigNumber,
    block: SnpProcessedBlock
  ): Promise<void> {
    await sql`
      UPDATE tokens
      SET total_supply = total_supply + ${delta}, updated_at = NOW()
      WHERE smart_contract_id = (SELECT id FROM smart_contracts WHERE principal = ${contract})
        AND token_number = 1
    `;
    logger.info(
      `ChainhookPgStore apply FT supply change for ${contract} (${delta}) at block ${block.block_height} #${block.index_block_hash}`
    );
  }

  private async rollBackContractDeployment(
    sql: PgSqlClient,
    contract: CachedEvent<SmartContractDeployment>,
    cache: BlockCache
  ): Promise<void> {
    await sql`
      DELETE FROM smart_contracts WHERE principal = ${contract.event.principal}
    `;
    logger.info(
      `ChainhookPgStore rollback contract ${contract.event.principal} at block ${cache.block.index}`
    );
  }

  private async rollBackNotification(
    sql: PgSqlClient,
    notification: CachedEvent<TokenMetadataUpdateNotification>,
    cache: BlockCache
  ): Promise<void> {
    await sql`
      DELETE FROM update_notifications
      WHERE block_height = ${cache.block.index}
        AND tx_index = ${notification.tx_index}
        AND event_index = ${notification.event_index}
    `;
    logger.info(
      `ChainhookPgStore rollback SIP-019 notification ${notification.event.contract_id} (${
        notification.event.token_ids ?? 'all'
      }) at block ${cache.block.index}`
    );
  }

  private async enqueueDynamicTokensDueForRefresh(): Promise<void> {
    const interval = ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL.toString();
    await this.sql`
      WITH dynamic_tokens AS (
        SELECT DISTINCT ON (token_id) token_id, ttl
        FROM update_notifications
        WHERE update_mode = 'dynamic'
        ORDER BY token_id, block_height DESC, tx_index DESC, event_index DESC
      ),
      due_for_refresh AS (
        SELECT d.token_id
        FROM dynamic_tokens AS d
        INNER JOIN tokens AS t ON t.id = d.token_id
        WHERE CASE
          WHEN d.ttl IS NOT NULL THEN
            COALESCE(t.updated_at, t.created_at) < (NOW() - INTERVAL '1 seconds' * ttl)
          ELSE
            COALESCE(t.updated_at, t.created_at) <
              (NOW() - INTERVAL '${this.sql(interval)} seconds')
          END
      )
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE status IN ('done', 'failed') AND token_id = (
        SELECT token_id FROM due_for_refresh
      )
    `;
  }

  private async applyTokenMints(
    sql: PgSqlClient,
    mints: SnpProcessedEvent<NftMintEvent>[],
    tokenType: DbTokenType,
    block: SnpProcessedBlock
  ): Promise<void> {
    if (mints.length == 0) return;
    for await (const batch of batchIterate(mints, 500)) {
      const tokenValues = new Map<string, (string | number)[]>();
      for (const m of batch) {
        // SFT tokens may mint one single token more than once given that it's an FT within an NFT.
        // This makes sure we only keep the first occurrence.
        const tokenKey = `${m.event.contractId}-${m.event.tokenId}`;
        if (tokenValues.has(tokenKey)) continue;
        logger.info(
          `ChainhookPgStore apply ${tokenType.toUpperCase()} mint ${m.event.contractId} (${
            m.event.tokenId
          }) at block ${block.block_height} #${block.index_block_hash}`
        );
        tokenValues.set(tokenKey, [
          m.event.contractId,
          tokenType,
          m.event.tokenId.toString(),
          block.block_height,
          block.index_block_hash,
          m.tx_id,
          m.tx_index,
        ]);
      }
      await sql`
        WITH insert_values (principal, type, token_number, block_height, index_block_hash, tx_id,
          tx_index) AS (VALUES ${sql([...tokenValues.values()])}),
        filtered_values AS (
          SELECT s.id AS smart_contract_id, i.type::token_type, i.token_number::bigint,
            i.block_height::bigint, i.index_block_hash::text, i.tx_id::text, i.tx_index::int
          FROM insert_values AS i
          INNER JOIN smart_contracts AS s ON s.principal = i.principal::text
        ),
        token_inserts AS (
          INSERT INTO tokens (smart_contract_id, type, token_number, block_height, index_block_hash,
            tx_id, tx_index) (SELECT * FROM filtered_values)
          ON CONFLICT ON CONSTRAINT tokens_smart_contract_id_token_number_unique DO
            UPDATE SET
              uri = EXCLUDED.uri,
              name = EXCLUDED.name,
              symbol = EXCLUDED.symbol,
              decimals = EXCLUDED.decimals,
              total_supply = EXCLUDED.total_supply,
              updated_at = NOW()
          RETURNING id
        )
        INSERT INTO jobs (token_id) (SELECT id AS token_id FROM token_inserts)
        ON CONFLICT (token_id) WHERE smart_contract_id IS NULL DO
          UPDATE SET updated_at = NOW(), status = 'pending'
      `;
    }
  }

  private async rollBackTokenMints(
    sql: PgSqlClient,
    mints: CachedEvent<NftMintEvent>[],
    tokenType: DbTokenType,
    cache: BlockCache
  ): Promise<void> {
    if (mints.length == 0) return;
    for await (const batch of batchIterate(mints, 500)) {
      const values = batch.map(m => {
        logger.info(
          `ChainhookPgStore rollback ${tokenType.toUpperCase()} mint ${m.event.contractId} (${
            m.event.tokenId
          }) at block ${cache.block.index}`
        );
        return [m.event.contractId, m.event.tokenId.toString()];
      });
      await sql`
        WITH delete_values (principal, token_number) AS (VALUES ${sql(values)})
        DELETE FROM tokens WHERE id IN (
          SELECT t.id
          FROM delete_values AS d
          INNER JOIN smart_contracts AS s ON s.principal = d.principal::text
          INNER JOIN tokens AS t
            ON t.smart_contract_id = s.id AND t.token_number = d.token_number::bigint
        )
      `;
    }
  }
}
