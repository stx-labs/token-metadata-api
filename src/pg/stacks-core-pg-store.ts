import { BasePgStoreModule, PgSqlClient, batchIterate, logger } from '@stacks/api-toolkit';
import { ENV } from '../env';
import {
  NftMintEvent,
  SftMintEvent,
  SmartContractDeployment,
  TokenMetadataUpdateNotification,
} from '../token-processor/util/sip-validation';
import {
  DbSmartContractInsert,
  DbTokenType,
  DbSmartContract,
  DbSipNumber,
  DbTokenInsert,
  DbBlock,
} from './types';
import { dbSipNumberToDbTokenType } from '../token-processor/util/helpers';
import BigNumber from 'bignumber.js';
import { DecodedStacksBlock } from '../stacks-core/stacks-core-block-processor';

export class StacksCorePgStore extends BasePgStoreModule {
  /**
   * Writes a processed Stacks Core block to the database.
   * @param block - The processed Stacks Core block to write.
   */
  async writeProcessedBlock(args: {
    block: DecodedStacksBlock;
    contracts: SmartContractDeployment[];
    notifications: TokenMetadataUpdateNotification[];
    nftMints: NftMintEvent[];
    sftMints: SftMintEvent[];
    ftSupplyDelta: Map<string, BigNumber>;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      await this.insertBlock(sql, args.block);
      for (const contract of args.contracts)
        await this.insertAndEnqueueSmartContract(sql, contract, args.block);
      for (const notification of args.notifications)
        await this.insertAndEnqueueNotification(sql, notification, args.block);
      await this.insertAndEnqueueMintedTokens(sql, args.nftMints, DbTokenType.nft, args.block);
      await this.insertAndEnqueueMintedTokens(sql, args.sftMints, DbTokenType.sft, args.block);
      for (const [contract, delta] of args.ftSupplyDelta)
        await this.insertAndEnqueueFtSupplyChange(sql, contract, delta, args.block);
      await this.enqueueDynamicTokensDueForRefresh();
    });
  }

  async insertBlock(sql: PgSqlClient, block: DecodedStacksBlock): Promise<void> {
    const values = {
      block_height: block.block_height,
      index_block_hash: block.index_block_hash,
      parent_index_block_hash: block.parent_index_block_hash,
      canonical: true,
    };
    await sql`INSERT INTO blocks ${sql(values)} ON CONFLICT (index_block_hash) DO NOTHING`;
  }

  async getChainTip(sql: PgSqlClient): Promise<DbBlock | null> {
    const result = await sql<DbBlock[]>`
      SELECT *
      FROM blocks
      WHERE canonical = true
      ORDER BY block_height DESC
      LIMIT 1
    `;
    return result.count > 0 ? result[0] : null;
  }

  async getBlock(sql: PgSqlClient, indexBlockHash: string): Promise<DbBlock | null> {
    const result = await sql<DbBlock[]>`
      SELECT *
      FROM blocks
      WHERE index_block_hash = ${indexBlockHash}
    `;
    return result.count > 0 ? result[0] : null;
  }

  /**
   * Reverts the database to a new chain tip after a re-org.
   * @param sql - The SQL client to use.
   * @param newChainTipHash - The new chain tip hash to revert to.
   * @returns Whether a re-org was detected.
   */
  async handleReOrg(sql: PgSqlClient, newChainTipHash: string): Promise<boolean> {
    const chainTip = await this.getChainTip(sql);
    // Empty chainstate, reorg impossible.
    if (!chainTip) return false;
    // We're at the canonical chain tip, no reorg.
    if (chainTip.index_block_hash === newChainTipHash) return false;

    const newChainTipBlock = await this.getBlock(sql, newChainTipHash);
    if (!newChainTipBlock) throw new Error(`Parent block ${newChainTipHash} not found`);

    // We detected a re-org.
    const supplyRefreshIds: Set<number> = new Set();
    const tokenRefreshIds: Set<number> = new Set();
    const contractRefreshIds: Set<number> = new Set();
    if (!newChainTipBlock.canonical) {
      // We received a block that advances an existent non-canonical fork. Find the common ancestor
      // so we can roll back to it and then apply the non-canonical chain that leads to the new
      // chain tip.
      const commonAncestor = await sql<DbBlock[]>`
        WITH RECURSIVE chain_tip_ancestors AS (
          SELECT index_block_hash, parent_index_block_hash, block_height, canonical
          FROM blocks
          WHERE index_block_hash = ${chainTip.index_block_hash}
          UNION ALL
          SELECT b.index_block_hash, b.parent_index_block_hash, b.block_height, b.canonical
          FROM blocks b
          INNER JOIN chain_tip_ancestors c ON c.parent_index_block_hash = b.index_block_hash
        ),
        new_tip_ancestors AS (
          SELECT index_block_hash, parent_index_block_hash, block_height, canonical
          FROM blocks
          WHERE index_block_hash = ${newChainTipHash}
          UNION ALL
          SELECT b.index_block_hash, b.parent_index_block_hash, b.block_height, b.canonical
          FROM blocks b
          INNER JOIN new_tip_ancestors n ON n.parent_index_block_hash = b.index_block_hash
        )
        SELECT c.*
        FROM chain_tip_ancestors c
        INNER JOIN new_tip_ancestors n ON n.index_block_hash = c.index_block_hash
        ORDER BY c.block_height DESC
        LIMIT 1
      `;
      if (commonAncestor.count == 0)
        throw new Error(
          `No common ancestor found for blocks ${chainTip.index_block_hash} and ${newChainTipHash}`
        );
      const blocksToRollBack = await sql<DbBlock[]>`
        SELECT *
        FROM blocks
        WHERE block_height > ${commonAncestor[0].block_height} AND canonical = true
        ORDER BY block_height DESC
      `;
      const blocksToApply = await sql<DbBlock[]>`
        SELECT *
        FROM blocks
        WHERE block_height > ${commonAncestor[0].block_height} AND canonical = false
        ORDER BY block_height ASC
      `;
      // Roll back to the common ancestor. Enqueue supply refresh jobs for affected FT supplies.
      const result1 = await this.markEntitiesCanonical(sql, {
        canonical: false,
        blocks: blocksToRollBack,
      });
      for (const ft of result1.ftSupplies) supplyRefreshIds.add(ft);
      // Apply the new fork. Enqueue token refresh jobs for newly-canonical tokens and FT supplies.
      const result2 = await this.markEntitiesCanonical(sql, {
        canonical: true,
        blocks: blocksToApply,
      });
      for (const ft of result2.ftSupplies) supplyRefreshIds.add(ft);
      for (const token of result2.tokens) tokenRefreshIds.add(token);
      for (const contract of result2.contracts) contractRefreshIds.add(contract);
    } else {
      // The new chain tip is part of our canonical chain. We just need to roll back to it so a new
      // fork can be created.
      const blocksToRollBack = await sql<DbBlock[]>`
        SELECT *
        FROM blocks
        WHERE block_height > ${newChainTipBlock.block_height} AND canonical = true
        ORDER BY block_height DESC
      `;
      // Roll back and enqueue supply refresh jobs for affected FT supplies.
      const result = await this.markEntitiesCanonical(sql, {
        canonical: false,
        blocks: blocksToRollBack,
      });
      for (const ft of result.ftSupplies) supplyRefreshIds.add(ft);
    }

    // Enqueue jobs for affected FT supplies, tokens, and contracts.
    await sql`
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE token_supply_id IN ${sql(Array.from(supplyRefreshIds))}
    `;
    await sql`
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE token_id IN ${sql(Array.from(tokenRefreshIds))}
    `;
    await sql`
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE smart_contract_id IN ${sql(Array.from(contractRefreshIds))}
    `;

    return true;
  }

  async markEntitiesCanonical(
    sql: PgSqlClient,
    args: { canonical: boolean; blocks: DbBlock[] }
  ): Promise<{ ftSupplies: Set<number>; tokens: Set<number>; contracts: Set<number> }> {
    const ftSupplies: Set<number> = new Set();
    const tokens: Set<number> = new Set();
    const contracts: Set<number> = new Set();

    for (const block of args.blocks) {
      // Mark FT supply deltas as canonical or non-canonical but record which tokens were affected
      // so we can refresh their total supplies.
      const affectedFts = await sql<{ token_id: number }[]>`
        UPDATE ft_supply_deltas
        SET canonical = ${args.canonical}
        WHERE index_block_hash = ${block.index_block_hash} AND canonical <> ${args.canonical}
        RETURNING token_id
      `;
      for (const ft of affectedFts) ftSupplies.add(ft.token_id);

      const affectedTokens = await sql<{ id: number }[]>`
        UPDATE tokens
        SET canonical = ${args.canonical}
        WHERE index_block_hash = ${block.index_block_hash} AND canonical <> ${args.canonical}
        RETURNING id
      `;
      for (const token of affectedTokens) tokens.add(token.id);

      const affectedContracts = await sql<{ id: number }[]>`
        UPDATE smart_contracts
        SET canonical = ${args.canonical}
        WHERE index_block_hash = ${block.index_block_hash} AND canonical <> ${args.canonical}
        RETURNING id
      `;
      for (const contract of affectedContracts) contracts.add(contract.id);

      // Mark the block's entities as canonical or non-canonical.
      await sql`
        WITH block_updates AS (
          UPDATE blocks
          SET canonical = ${args.canonical}
          WHERE index_block_hash = ${block.index_block_hash} AND canonical <> ${args.canonical}
        ),
        update_notification_updates AS (
          UPDATE update_notifications
          SET canonical = ${args.canonical}
          WHERE index_block_hash = ${block.index_block_hash} AND canonical <> ${args.canonical}
        )
        SELECT 1
      `;
    }

    return { ftSupplies, tokens, contracts };
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
    const tokenValues: DbTokenInsert[] = [];
    for (let index = 1; index <= args.token_count; index++)
      tokenValues.push({
        smart_contract_id: args.smart_contract.id,
        token_number: index.toString(),
        type: dbSipNumberToDbTokenType(args.smart_contract.sip),
        block_height: args.smart_contract.block_height,
        index_block_hash: args.smart_contract.index_block_hash,
        tx_id: args.smart_contract.tx_id,
        tx_index: args.smart_contract.tx_index,
        canonical: true,
        name: null,
        symbol: null,
        decimals: null,
        total_supply: null,
        uri: null,
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
        ON CONFLICT (token_id) WHERE smart_contract_id IS NULL AND token_supply_id IS NULL DO
          UPDATE SET updated_at = NOW(), status = 'pending'
      `;
    }
  }

  async insertAndEnqueueSmartContract(
    sql: PgSqlClient,
    contract: SmartContractDeployment,
    block: DecodedStacksBlock
  ) {
    await this.enqueueContract(sql, {
      principal: contract.principal,
      sip: contract.sip,
      block_height: block.block_height,
      index_block_hash: block.index_block_hash,
      tx_id: contract.tx_id,
      tx_index: contract.tx_index,
      fungible_token_name: contract.fungible_token_name ?? null,
      non_fungible_token_name: contract.non_fungible_token_name ?? null,
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
      canonical: true,
    };
    await sql`
      WITH smart_contract_inserts AS (
        INSERT INTO smart_contracts ${sql(values)}
        ON CONFLICT ON CONSTRAINT smart_contracts_principal_key DO UPDATE SET updated_at = NOW()
        RETURNING id
      )
      INSERT INTO jobs (smart_contract_id)
        (SELECT id AS smart_contract_id FROM smart_contract_inserts)
      ON CONFLICT (smart_contract_id) WHERE token_id IS NULL AND token_supply_id IS NULL DO
        UPDATE SET updated_at = NOW(), status = 'pending'
    `;
  }

  private async insertAndEnqueueNotification(
    sql: PgSqlClient,
    event: TokenMetadataUpdateNotification,
    block: DecodedStacksBlock
  ) {
    const contractResult = await sql<{ id: number }[]>`
      SELECT id FROM smart_contracts WHERE principal = ${event.contract_id} LIMIT 1
    `;
    if (contractResult.count == 0) {
      return;
    }
    await sql`
      WITH affected_token_ids AS (
        SELECT t.id
        FROM tokens AS t
        INNER JOIN smart_contracts AS s ON s.id = t.smart_contract_id
        WHERE s.principal = ${event.contract_id}
        ${event.token_ids?.length ? sql`AND t.token_number IN ${sql(event.token_ids)}` : sql``}
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
          SELECT id, ${event.update_mode}, ${event.ttl ?? null},
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
  }

  private async insertAndEnqueueFtSupplyChange(
    sql: PgSqlClient,
    contract: string,
    delta: BigNumber,
    block: DecodedStacksBlock
  ): Promise<void> {
    await sql`
      WITH smart_contract_id AS (
        SELECT id FROM smart_contracts
        WHERE principal = ${contract}
      ),
      token_id AS (
        SELECT id FROM tokens
        WHERE smart_contract_id = (SELECT id FROM smart_contract_id)
          AND token_number = 1
      ),
      delta_insert AS (
        INSERT INTO ft_supply_deltas (token_id, block_height, index_block_hash, delta)
        VALUES (
          (SELECT id FROM token_id), ${block.block_height}, ${block.index_block_hash}, ${delta}
        )
      )
      INSERT INTO jobs (token_supply_id)
        (SELECT id AS token_supply_id FROM token_id)
      ON CONFLICT (token_supply_id) WHERE smart_contract_id IS NULL AND token_id IS NULL DO
        UPDATE SET updated_at = NOW(), status = 'pending'
    `;
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

  private async insertAndEnqueueMintedTokens(
    sql: PgSqlClient,
    mints: NftMintEvent[] | SftMintEvent[],
    tokenType: DbTokenType,
    block: DecodedStacksBlock
  ): Promise<void> {
    if (mints.length == 0) return;
    for await (const batch of batchIterate(mints, 500)) {
      const tokenValues = new Map<string, (string | number)[]>();
      for (const mint of batch) {
        // SFT tokens may mint one single token more than once given that it's an FT within an NFT.
        // This makes sure we only keep the first occurrence.
        const tokenKey = `${mint.contractId}-${mint.tokenId}`;
        if (tokenValues.has(tokenKey)) continue;
        tokenValues.set(tokenKey, [
          mint.contractId,
          tokenType,
          mint.tokenId.toString(),
          block.block_height,
          block.index_block_hash,
          mint.tx_id,
          mint.tx_index,
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
        ON CONFLICT (token_id) WHERE smart_contract_id IS NULL AND token_supply_id IS NULL DO
          UPDATE SET updated_at = NOW(), status = 'pending'
      `;
    }
  }
}
