import BigNumber from 'bignumber.js';
import {
  StacksCoreBlock,
  StacksCoreFtBurnEvent,
  StacksCoreFtMintEvent,
  StacksCoreNftMintEvent,
  StacksCoreContractEvent,
  StacksCoreTransaction,
  StacksCoreEvent,
} from './schemas';
import {
  getContractLogMetadataUpdateNotification,
  getContractLogSftMintEvent,
  getSmartContractDeployment,
  NftMintEvent,
  SftMintEvent,
  SmartContractDeployment,
  TokenMetadataUpdateNotification,
} from '../token-processor/util/sip-validation';
import {
  ClarityTypeID,
  decodeClarityValue,
  DecodedTxResult,
  decodeTransaction,
} from '@hirosystems/stacks-encoding-native-js';
import { StacksCorePgStore } from '../pg/stacks-core-pg-store';
import { logger, stopwatch } from '@hirosystems/api-toolkit';

export type DecodedStacksTransaction = {
  tx: StacksCoreTransaction;
  decoded: DecodedTxResult;
  events: StacksCoreEvent[];
};

export type DecodedStacksBlock = {
  block_height: number;
  index_block_hash: string;
  parent_index_block_hash: string;
  transactions: DecodedStacksTransaction[];
};

/**
 * Decodes a Stacks Core block message into a standardized block object.
 * @param block - The Stacks Core block message to decode.
 * @returns The decoded Stacks Core block.
 */
export function decodeStacksCoreBlock(block: StacksCoreBlock): DecodedStacksBlock {
  // Group events by transaction ID.
  const events: Map<string, StacksCoreEvent[]> = new Map();
  for (const event of block.events) {
    events.set(event.txid, [...(events.get(event.txid) || []), event]);
  }
  // Decode transactions and sort their events by event index.
  const transactions = block.transactions.map(tx => ({
    tx: tx,
    decoded: decodeTransaction(tx.raw_tx.substring(2)),
    events: (events.get(tx.txid) || []).sort((a, b) => a.event_index - b.event_index),
  }));
  // Sort transactions by transaction index.
  const decodedBlock: DecodedStacksBlock = {
    block_height: block.block_height,
    index_block_hash: block.index_block_hash,
    parent_index_block_hash: block.parent_index_block_hash,
    transactions: transactions.sort((a, b) => a.tx.tx_index - b.tx.tx_index),
  };
  return decodedBlock;
}

/**
 * Processes a Stacks Core block and writes contract deployments, token metadata updates, token
 * supply deltas, and token mints to the database.
 */
export class StacksCoreBlockProcessor {
  private readonly db: StacksCorePgStore;

  constructor(args: { db: StacksCorePgStore }) {
    this.db = args.db;
  }

  async processBlock(block: DecodedStacksBlock): Promise<void> {
    const time = stopwatch();
    logger.info(
      `${this.constructor.name} processing block ${block.block_height} #${block.index_block_hash}`
    );

    await this.db.sqlWriteTransaction(async sql => {
      // Check if this block represents a re-org. Revert to its parent's chain tip if it does.
      const chainTip = await this.db.getChainTip(sql);
      if (chainTip && chainTip.index_block_hash !== block.parent_index_block_hash) {
        logger.info(
          `${this.constructor.name} detected re-org, reverting to chain tip at parent block ${
            block.block_height - 1
          } ${block.parent_index_block_hash}`
        );
        await this.db.revertToChainTip(sql, {
          block_height: block.block_height - 1,
          index_block_hash: block.parent_index_block_hash,
        });
      }

      const contracts: SmartContractDeployment[] = [];
      const notifications: TokenMetadataUpdateNotification[] = [];
      const sftMints: SftMintEvent[] = [];
      const nftMints: NftMintEvent[] = [];
      const ftSupplyDelta: Map<string, BigNumber> = new Map();

      // Process each transaction in the block.
      for (const transaction of block.transactions) {
        if (transaction.tx.status !== 'success') continue;
        this.processTransaction(transaction, contracts);
        for (const event of transaction.events) {
          switch (event.type) {
            case 'contract_event':
              this.processContractEvent(transaction, event, notifications, sftMints);
              break;
            case 'ft_mint_event':
              this.processFtMintEvent(event, ftSupplyDelta);
              break;
            case 'ft_burn_event':
              this.processFtBurnEvent(event, ftSupplyDelta);
              break;
            case 'nft_mint_event':
              this.processNftMintEvent(transaction, event, nftMints);
              break;
            case 'nft_burn_event':
              // Burned NFTs still have their metadata in the database, so we don't need to do
              // anything here.
              break;
          }
        }
      }

      await this.db.writeProcessedBlock({
        block,
        contracts,
        notifications,
        nftMints,
        sftMints,
        ftSupplyDelta,
      });
    });
    logger.info(
      `${this.constructor.name} processed block ${block.block_height} ${
        block.index_block_hash
      } in ${time.getElapsedSeconds()}s`
    );
  }

  private processTransaction(
    transaction: DecodedStacksTransaction,
    contracts: SmartContractDeployment[]
  ) {
    const deployment = getSmartContractDeployment(transaction);
    if (deployment) {
      contracts.push(deployment);
      logger.info(
        {
          contract: deployment.principal,
          sip: deployment.sip,
          txid: transaction.tx.txid,
        },
        `${this.constructor.name} found contract ${deployment.principal} (${deployment.sip})`
      );
    }
  }

  private processContractEvent(
    transaction: DecodedStacksTransaction,
    event: StacksCoreContractEvent,
    notifications: TokenMetadataUpdateNotification[],
    sftMints: SftMintEvent[]
  ) {
    const notification = getContractLogMetadataUpdateNotification(transaction, event);
    if (notification) {
      notifications.push(notification);
      logger.info(
        {
          contract: notification.contract_id,
          txid: event.txid,
        },
        `${this.constructor.name} found metadata update notification for ${notification.contract_id}`
      );
      return;
    }
    const mint = getContractLogSftMintEvent(transaction, event);
    if (mint) {
      sftMints.push(mint);
      logger.info(
        {
          contract: mint.contractId,
          txid: event.txid,
          amount: mint.amount,
        },
        `${this.constructor.name} found SFT mint for ${mint.contractId} #${mint.tokenId}`
      );
      return;
    }
  }

  private processFtMintEvent(event: StacksCoreFtMintEvent, ftSupplyDelta: Map<string, BigNumber>) {
    const principal = event.ft_mint_event.asset_identifier.split('::')[0];
    const previous = ftSupplyDelta.get(principal) ?? BigNumber(0);
    const amount = BigNumber(event.ft_mint_event.amount);
    ftSupplyDelta.set(principal, previous.plus(amount));
    logger.info(
      {
        contract: principal,
        amount: amount.toString(),
        txid: event.txid,
      },
      `${this.constructor.name} found FT mint for ${principal}`
    );
  }

  private processFtBurnEvent(event: StacksCoreFtBurnEvent, ftSupplyDelta: Map<string, BigNumber>) {
    const principal = event.ft_burn_event.asset_identifier.split('::')[0];
    const previous = ftSupplyDelta.get(principal) ?? BigNumber(0);
    const amount = BigNumber(event.ft_burn_event.amount);
    ftSupplyDelta.set(principal, previous.minus(amount));
    logger.info(
      {
        contract: principal,
        amount: amount.toString(),
        txid: event.txid,
      },
      `${this.constructor.name} found FT burn for ${principal}`
    );
  }

  private processNftMintEvent(
    transaction: DecodedStacksTransaction,
    event: StacksCoreNftMintEvent,
    nftMints: NftMintEvent[]
  ) {
    const value = decodeClarityValue(event.nft_mint_event.raw_value);
    if (value.type_id === ClarityTypeID.UInt) {
      const principal = event.nft_mint_event.asset_identifier.split('::')[0];
      const tokenId = BigInt(value.value);
      nftMints.push({
        tx_id: transaction.tx.txid,
        tx_index: transaction.tx.tx_index,
        event_index: event.event_index,
        contractId: principal,
        tokenId,
      });
      logger.info(
        {
          contract: principal,
          tokenId: tokenId.toString(),
          txid: event.txid,
        },
        `${this.constructor.name} found NFT mint for ${principal} #${tokenId}`
      );
    }
  }
}
