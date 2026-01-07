import BigNumber from 'bignumber.js';
import {
  SnpBlock,
  SnpFtBurnEvent,
  SnpFtMintEvent,
  SnpNftMintEvent,
  SnpSmartContractPrintEvent,
  SnpTransaction,
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
import { SnpPgStore } from '../pg/snp-pg-store';

export type SnpProcessedEvent<T> = {
  event: T;
  tx_id: string;
  tx_index: number;
  event_index?: number;
};

export type SnpIndexedTransaction = {
  tx: SnpTransaction;
  decoded: DecodedTxResult;
};

export type SnpProcessedBlock = {
  block_height: number;
  index_block_hash: string;
  transactions: Map<string, SnpIndexedTransaction>;
  contracts: SnpProcessedEvent<SmartContractDeployment>[];
  notifications: SnpProcessedEvent<TokenMetadataUpdateNotification>[];
  sftMints: SnpProcessedEvent<SftMintEvent>[];
  nftMints: SnpProcessedEvent<NftMintEvent>[];
  ftSupplyDelta: Map<string, BigNumber>;
};

export class SnpBlockProcessor {
  private readonly db: SnpPgStore;

  private block: SnpProcessedBlock = {
    block_height: 0,
    index_block_hash: '',
    transactions: new Map<string, SnpIndexedTransaction>(),
    contracts: [],
    notifications: [],
    sftMints: [],
    nftMints: [],
    ftSupplyDelta: new Map<string, BigNumber>(),
  };

  constructor(args: { db: SnpPgStore }) {
    this.db = args.db;
  }

  async process(block: SnpBlock): Promise<void> {
    this.block.block_height = block.block_height;
    this.block.index_block_hash = block.index_block_hash;

    for (const transaction of block.transactions) {
      if (transaction.status !== 'success') continue;

      const indexedTransaction: SnpIndexedTransaction = {
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
  }

  private processSmartContract(transaction: SnpIndexedTransaction) {
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
      this.block.contracts.push({
        event: {
          principal: `${sender}.${payload.contract_name}`,
          sip,
          fungible_token_name: abi.fungible_tokens[0]?.name,
          non_fungible_token_name: abi.non_fungible_tokens[0]?.name,
        },
        tx_id: transaction.tx.txid,
        tx_index: transaction.tx.tx_index,
      });
    }
  }

  private processContractEvent(
    transaction: SnpIndexedTransaction,
    event: SnpSmartContractPrintEvent
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
      return;
    }
  }

  private processFtMintEvent(event: SnpFtMintEvent) {
    const principal = event.ft_mint_event.asset_identifier.split('::')[0];
    const previous = this.block.ftSupplyDelta.get(principal) ?? BigNumber(0);
    const amount = BigNumber(event.ft_mint_event.amount);
    this.block.ftSupplyDelta.set(principal, previous.plus(amount));
  }

  private processFtBurnEvent(event: SnpFtBurnEvent) {
    const principal = event.ft_burn_event.asset_identifier.split('::')[0];
    const previous = this.block.ftSupplyDelta.get(principal) ?? BigNumber(0);
    const amount = BigNumber(event.ft_burn_event.amount);
    this.block.ftSupplyDelta.set(principal, previous.minus(amount));
  }

  private processNftMintEvent(transaction: SnpIndexedTransaction, event: SnpNftMintEvent) {
    const value = decodeClarityValue(event.nft_mint_event.raw_value);
    if (value.type_id === ClarityTypeID.UInt)
      this.block.nftMints.push({
        event: {
          contractId: event.nft_mint_event.asset_identifier.split('::')[0],
          tokenId: BigInt(value.value),
        },
        tx_id: event.txid,
        tx_index: transaction.tx.tx_index,
        event_index: event.event_index,
      });
  }
}
