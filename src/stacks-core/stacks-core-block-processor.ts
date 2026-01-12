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
 * Processes a Stacks Core block and writes contract deployments, token metadata updates, token
 * supply deltas, and token mints to the database.
 */
export class StacksCoreBlockProcessor {
  private readonly db: StacksCorePgStore;
  private readonly block: DecodedStacksBlock;

  private contracts: SmartContractDeployment[] = [];
  private notifications: TokenMetadataUpdateNotification[] = [];
  private sftMints: SftMintEvent[] = [];
  private nftMints: NftMintEvent[] = [];
  private ftSupplyDelta: Map<string, BigNumber> = new Map();

  static init(args: { block: StacksCoreBlock; db: StacksCorePgStore }): StacksCoreBlockProcessor {
    // Group events by transaction ID.
    const events: Map<string, StacksCoreEvent[]> = new Map();
    for (const event of args.block.events) {
      events.set(event.txid, [...(events.get(event.txid) || []), event]);
    }
    // Decode transactions and sort their events by event index.
    const transactions = args.block.transactions.map(tx => ({
      tx: tx,
      decoded: decodeTransaction(tx.raw_tx.substring(2)),
      events: (events.get(tx.txid) || []).sort((a, b) => a.event_index - b.event_index),
    }));
    // Sort transactions by transaction index.
    const decodedBlock: DecodedStacksBlock = {
      block_height: args.block.block_height,
      index_block_hash: args.block.index_block_hash,
      parent_index_block_hash: args.block.parent_index_block_hash,
      transactions: transactions.sort((a, b) => a.tx.tx_index - b.tx.tx_index),
    };
    return new StacksCoreBlockProcessor({ db: args.db, decodedBlock });
  }

  constructor(args: { db: StacksCorePgStore; decodedBlock: DecodedStacksBlock }) {
    this.db = args.db;
    this.block = args.decodedBlock;
  }

  async process(): Promise<void> {
    const time = stopwatch();
    logger.info(
      `${this.constructor.name} processing block ${this.block.block_height} #${this.block.index_block_hash}`
    );

    await this.db.sqlWriteTransaction(async sql => {
      // Check if this block represents a re-org. Revert to its parent's chain tip if it does.
      const chainTip = await this.db.getChainTip(sql);
      if (chainTip && chainTip.index_block_hash !== this.block.parent_index_block_hash) {
        logger.info(
          `${this.constructor.name} detected re-org, reverting to chain tip at parent block ${
            this.block.block_height - 1
          } ${this.block.parent_index_block_hash}`
        );
        await this.db.revertToChainTip(sql, chainTip);
      }

      // Process each transaction in the block.
      for (const transaction of this.block.transactions) {
        if (transaction.tx.status !== 'success') continue;
        this.processTransaction(transaction);
        for (const event of transaction.events) {
          switch (event.type) {
            case 'contract_event':
              this.processContractEvent(transaction, event);
              break;
            case 'ft_mint_event':
              this.processFtMintEvent(event);
              break;
            case 'ft_burn_event':
              this.processFtBurnEvent(event);
              break;
            case 'nft_mint_event':
              this.processNftMintEvent(transaction, event);
              break;
            case 'nft_burn_event':
              // Burned NFTs still have their metadata in the database, so we don't need to do
              // anything here.
              break;
          }
        }
      }

      await this.db.writeProcessedBlock({
        block: this.block,
        contracts: this.contracts,
        notifications: this.notifications,
        nftMints: this.nftMints,
        sftMints: this.sftMints,
        ftSupplyDelta: this.ftSupplyDelta,
      });
    });
    logger.info(
      `${this.constructor.name} processed block ${this.block.block_height} ${
        this.block.index_block_hash
      } in ${time.getElapsedSeconds()}s`
    );
  }

  private processTransaction(transaction: DecodedStacksTransaction) {
    const deployment = getSmartContractDeployment(transaction);
    if (deployment) {
      this.contracts.push(deployment);
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
    event: StacksCoreContractEvent
  ) {
    const notification = getContractLogMetadataUpdateNotification(transaction, event);
    if (notification) {
      this.notifications.push(notification);
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
      this.sftMints.push(mint);
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

  private processFtMintEvent(event: StacksCoreFtMintEvent) {
    const principal = event.ft_mint_event.asset_identifier.split('::')[0];
    const previous = this.ftSupplyDelta.get(principal) ?? BigNumber(0);
    const amount = BigNumber(event.ft_mint_event.amount);
    this.ftSupplyDelta.set(principal, previous.plus(amount));
    logger.info(
      {
        contract: principal,
        amount: amount.toString(),
        txid: event.txid,
      },
      `${this.constructor.name} found FT mint for ${principal}`
    );
  }

  private processFtBurnEvent(event: StacksCoreFtBurnEvent) {
    const principal = event.ft_burn_event.asset_identifier.split('::')[0];
    const previous = this.ftSupplyDelta.get(principal) ?? BigNumber(0);
    const amount = BigNumber(event.ft_burn_event.amount);
    this.ftSupplyDelta.set(principal, previous.minus(amount));
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
    event: StacksCoreNftMintEvent
  ) {
    const value = decodeClarityValue(event.nft_mint_event.raw_value);
    if (value.type_id === ClarityTypeID.UInt) {
      const principal = event.nft_mint_event.asset_identifier.split('::')[0];
      const tokenId = BigInt(value.value);
      this.nftMints.push({
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
