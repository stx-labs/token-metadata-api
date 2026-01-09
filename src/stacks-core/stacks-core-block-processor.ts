import BigNumber from 'bignumber.js';
import {
  StacksCoreBlock,
  StacksCoreFtBurnEvent,
  StacksCoreFtMintEvent,
  StacksCoreNftMintEvent,
  StacksCoreContractEvent,
  StacksCoreTransaction,
} from './schemas';
import {
  getContractLogMetadataUpdateNotification,
  getContractLogSftMintEvent,
  getSmartContractSip,
  NftMintEvent,
  SftMintEvent,
  SmartContractDeployment,
  TokenMetadataUpdateNotification,
} from '../token-processor/util/sip-validation';
import { ClarityAbi } from '@stacks/transactions';
import {
  ClarityTypeID,
  decodeClarityValue,
  DecodedTxResult,
  decodeTransaction,
  TxPayloadTypeID,
} from '@hirosystems/stacks-encoding-native-js';
import { StacksCorePgStore } from '../pg/stacks-core-pg-store';
import { logger, stopwatch } from '@hirosystems/api-toolkit';

export type ProcessedStacksCoreEvent<T> = {
  event: T;
  tx_id: string;
  tx_index: number;
  event_index?: number;
};

export type ProcessedStacksCoreTransaction = {
  tx: StacksCoreTransaction;
  decoded: DecodedTxResult;
};

export type ProcessedStacksCoreBlock = {
  blockHeight: number;
  indexBlockHash: string;
  transactions: Map<string, ProcessedStacksCoreTransaction>;
  contracts: ProcessedStacksCoreEvent<SmartContractDeployment>[];
  notifications: ProcessedStacksCoreEvent<TokenMetadataUpdateNotification>[];
  sftMints: ProcessedStacksCoreEvent<SftMintEvent>[];
  nftMints: ProcessedStacksCoreEvent<NftMintEvent>[];
  ftSupplyDelta: Map<string, BigNumber>;
};

/**
 * Processes a Stacks Core block and writes contract deployments, token metadata updates, token
 * supply deltas, and token mints to the database.
 */
export class StacksCoreBlockProcessor {
  private readonly db: StacksCorePgStore;

  private block: ProcessedStacksCoreBlock = {
    blockHeight: 0,
    indexBlockHash: '',
    transactions: new Map<string, ProcessedStacksCoreTransaction>(),
    contracts: [],
    notifications: [],
    sftMints: [],
    nftMints: [],
    ftSupplyDelta: new Map<string, BigNumber>(),
  };

  constructor(args: { db: StacksCorePgStore }) {
    this.db = args.db;
  }

  async process(block: StacksCoreBlock): Promise<void> {
    const time = stopwatch();
    this.clear();
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
        await this.db.revertToChainTip(sql, chainTip);
      }

      // Process the block.
      this.block.blockHeight = block.block_height;
      this.block.indexBlockHash = block.index_block_hash;
      for (const transaction of block.transactions) {
        if (transaction.status !== 'success') continue;

        const indexedTransaction: ProcessedStacksCoreTransaction = {
          tx: transaction,
          decoded: decodeTransaction(transaction.raw_tx.substring(2)),
        };
        this.block.transactions.set(transaction.txid, indexedTransaction);

        // Check for smart contract deployments.
        this.processSmartContract(indexedTransaction);
      }
      // Check for token metadata updates and token supply deltas.
      for (const event of block.events) {
        const transaction = this.block.transactions.get(event.txid);
        if (!transaction) continue;
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
            // Burned NFTs still have their metadata in the database, so we don't need to do anything
            // here.
            break;
        }
      }

      await this.db.writeBlock(this.block);
    });
    this.clear();
    logger.info(
      `${this.constructor.name} processed block ${block.block_height} ${
        block.index_block_hash
      } in ${time.getElapsedSeconds()}s`
    );
  }

  private clear() {
    this.block = {
      blockHeight: 0,
      indexBlockHash: '',
      transactions: new Map<string, ProcessedStacksCoreTransaction>(),
      contracts: [],
      notifications: [],
      sftMints: [],
      nftMints: [],
      ftSupplyDelta: new Map<string, BigNumber>(),
    };
  }

  private processSmartContract(transaction: ProcessedStacksCoreTransaction) {
    if (transaction.tx.contract_interface == null) return;

    // Parse the included ABI to check if it's a token contract.
    const abi = JSON.parse(transaction.tx.contract_interface) as ClarityAbi;
    const sip = getSmartContractSip(abi);
    if (!sip) return;

    const sender = transaction.decoded.auth.origin_condition.signer.address;
    const payload = transaction.decoded.payload;
    if (
      payload.type_id === TxPayloadTypeID.SmartContract ||
      payload.type_id === TxPayloadTypeID.VersionedSmartContract
    ) {
      const principal = `${sender}.${payload.contract_name}`;
      this.block.contracts.push({
        event: {
          principal,
          sip,
          fungible_token_name: abi.fungible_tokens[0]?.name,
          non_fungible_token_name: abi.non_fungible_tokens[0]?.name,
        },
        tx_id: transaction.tx.txid,
        tx_index: transaction.tx.tx_index,
      });
      logger.info(
        {
          contract: principal,
          sip,
          txid: transaction.tx.txid,
        },
        `${this.constructor.name} found contract ${principal} (${sip})`
      );
    }
  }

  private processContractEvent(
    transaction: ProcessedStacksCoreTransaction,
    event: StacksCoreContractEvent
  ) {
    const sender = transaction.decoded.auth.origin_condition.signer.address;
    const notification = getContractLogMetadataUpdateNotification(sender, event);
    if (notification) {
      this.block.notifications.push({
        event: notification,
        tx_id: event.txid,
        tx_index: transaction.tx.tx_index,
        event_index: event.event_index,
      });
      logger.info(
        {
          contract: notification.contract_id,
          txid: event.txid,
        },
        `${this.constructor.name} found metadata update notification for ${notification.contract_id}`
      );
      return;
    }
    const mint = getContractLogSftMintEvent(event);
    if (mint) {
      this.block.sftMints.push({
        event: mint,
        tx_id: event.txid,
        tx_index: transaction.tx.tx_index,
        event_index: event.event_index,
      });
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
    const previous = this.block.ftSupplyDelta.get(principal) ?? BigNumber(0);
    const amount = BigNumber(event.ft_mint_event.amount);
    this.block.ftSupplyDelta.set(principal, previous.plus(amount));
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
    const previous = this.block.ftSupplyDelta.get(principal) ?? BigNumber(0);
    const amount = BigNumber(event.ft_burn_event.amount);
    this.block.ftSupplyDelta.set(principal, previous.minus(amount));
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
    transaction: ProcessedStacksCoreTransaction,
    event: StacksCoreNftMintEvent
  ) {
    const value = decodeClarityValue(event.nft_mint_event.raw_value);
    if (value.type_id === ClarityTypeID.UInt) {
      const principal = event.nft_mint_event.asset_identifier.split('::')[0];
      const tokenId = BigInt(value.value);
      this.block.nftMints.push({
        event: {
          contractId: principal,
          tokenId,
        },
        tx_id: event.txid,
        tx_index: transaction.tx.tx_index,
        event_index: event.event_index,
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
