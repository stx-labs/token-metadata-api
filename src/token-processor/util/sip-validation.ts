import { ClarityAbiFunction, ClarityAbi } from '@stacks/transactions';
import {
  ClarityTypeID,
  ClarityValue,
  ClarityValueTuple,
  ClarityValueList,
  ClarityValueUInt,
  decodeClarityValue,
  TxPayloadTypeID,
} from '@hirosystems/stacks-encoding-native-js';
import { DbSipNumber } from '../../pg/types';
import { StacksCoreContractEvent } from '../../stacks-core/schemas';
import { DecodedStacksTransaction } from '../../stacks-core/stacks-core-block-processor';

const FtTraitFunctions: ClarityAbiFunction[] = [
  {
    access: 'public',
    args: [
      { type: 'uint128', name: 'amount' },
      { type: 'principal', name: 'sender' },
      { type: 'principal', name: 'recipient' },
      { type: { optional: { buffer: { length: 34 } } }, name: 'memo' },
    ],
    name: 'transfer',
    outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-name',
    outputs: { type: { response: { ok: { 'string-ascii': { length: 32 } }, error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-symbol',
    outputs: { type: { response: { ok: { 'string-ascii': { length: 32 } }, error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-decimals',
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [{ type: 'principal', name: 'address' }],
    name: 'get-balance',
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-total-supply',
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    access: 'read_only',
    args: [],
    name: 'get-token-uri',
    outputs: {
      type: {
        response: {
          ok: {
            optional: { 'string-ascii': { length: 256 } },
          },
          error: 'uint128',
        },
      },
    },
  },
];

const NftTraitFunctions: ClarityAbiFunction[] = [
  {
    access: 'read_only',
    args: [],
    name: 'get-last-token-id',
    outputs: {
      type: {
        response: {
          ok: 'uint128',
          error: 'uint128',
        },
      },
    },
  },
  {
    access: 'read_only',
    args: [{ name: 'any', type: 'uint128' }],
    name: 'get-token-uri',
    outputs: {
      type: {
        response: {
          ok: {
            optional: { 'string-ascii': { length: 256 } },
          },
          error: 'uint128',
        },
      },
    },
  },
  {
    access: 'read_only',
    args: [{ type: 'uint128', name: 'any' }],
    name: 'get-owner',
    outputs: {
      type: {
        response: {
          ok: {
            optional: 'principal',
          },
          error: 'uint128',
        },
      },
    },
  },
  {
    access: 'public',
    args: [
      { type: 'uint128', name: 'id' },
      { type: 'principal', name: 'sender' },
      { type: 'principal', name: 'recipient' },
    ],
    name: 'transfer',
    outputs: {
      type: {
        response: {
          ok: 'bool',
          error: {
            tuple: [
              { type: { 'string-ascii': { length: 32 } }, name: 'kind' },
              { type: 'uint128', name: 'code' },
            ],
          },
        },
      },
    },
  },
];

const SftTraitFunctions: ClarityAbiFunction[] = [
  {
    name: 'get-balance',
    access: 'read_only',
    args: [
      { type: 'uint128', name: 'token-id' },
      { type: 'principal', name: 'address' },
    ],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-overall-balance',
    access: 'read_only',
    args: [{ type: 'principal', name: 'address' }],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-total-supply',
    access: 'read_only',
    args: [{ type: 'uint128', name: 'token-id' }],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-overall-supply',
    access: 'read_only',
    args: [],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-decimals',
    access: 'read_only',
    args: [{ type: 'uint128', name: 'token-id' }],
    outputs: { type: { response: { ok: 'uint128', error: 'uint128' } } },
  },
  {
    name: 'get-token-uri',
    access: 'read_only',
    args: [{ type: 'uint128', name: 'token-id' }],
    outputs: {
      type: {
        response: {
          ok: {
            optional: { 'string-ascii': { length: 256 } },
          },
          error: 'uint128',
        },
      },
    },
  },
  {
    name: 'transfer',
    access: 'public',
    args: [
      { type: 'uint128', name: 'token-id' },
      { type: 'uint128', name: 'amount' },
      { type: 'principal', name: 'sender' },
      { type: 'principal', name: 'recipient' },
    ],
    outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
  },
  {
    name: 'transfer-memo',
    access: 'public',
    args: [
      { type: 'uint128', name: 'token-id' },
      { type: 'uint128', name: 'amount' },
      { type: 'principal', name: 'sender' },
      { type: 'principal', name: 'recipient' },
      { type: { buffer: { length: 34 } }, name: 'memo' },
    ],
    outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
  },
];

/**
 * Detects which token SIP the given contract conforms to, if any.
 * @param abi - Contract abi
 * @returns SIP or false
 */
export function getSmartContractSip(abi: ClarityAbi): DbSipNumber | undefined {
  if (!abi) {
    return;
  }
  try {
    if (abiContains(abi, SftTraitFunctions)) {
      return DbSipNumber.sip013;
    }
    if (abi.non_fungible_tokens.length > 0 && abiContains(abi, NftTraitFunctions)) {
      return DbSipNumber.sip009;
    }
    if (abi.fungible_tokens.length > 0 && abiContains(abi, FtTraitFunctions)) {
      return DbSipNumber.sip010;
    }
  } catch (error) {
    // Not a token contract.
  }
}

function abiContains(abi: ClarityAbi, standardFunction: ClarityAbiFunction[]): boolean {
  return standardFunction.every(abiFun => findFunction(abiFun, abi.functions));
}

function findFunction(fun: ClarityAbiFunction, functionList: ClarityAbiFunction[]): boolean {
  const found = functionList.find(standardFunction => {
    if (standardFunction.name !== fun.name || standardFunction.args.length !== fun.args.length)
      return false;
    for (let i = 0; i < fun.args.length; i++) {
      if (standardFunction.args[i].type.toString() !== fun.args[i].type.toString()) {
        return false;
      }
    }
    return true;
  });
  return found !== undefined;
}

function stringFromValue(value: ClarityValue): string {
  switch (value.type_id) {
    case ClarityTypeID.Buffer:
      const parts = value.buffer.substring(2).match(/.{1,2}/g) ?? [];
      const arr = Uint8Array.from(parts.map(byte => parseInt(byte, 16)));
      return Buffer.from(arr).toString('utf8');
    case ClarityTypeID.StringAscii:
    case ClarityTypeID.StringUtf8:
      return value.data;
    case ClarityTypeID.PrincipalContract:
      return `${value.address}.${value.contract_name}`;
    case ClarityTypeID.PrincipalStandard:
      return value.address;
    default:
      throw new Error('Invalid clarity value');
  }
}

type TokenClass = 'ft' | 'nft' | 'sft';

export function tokenClassFromSipNumber(sip: DbSipNumber): TokenClass {
  switch (sip) {
    case DbSipNumber.sip009:
      return 'nft';
    case DbSipNumber.sip010:
      return 'ft';
    case DbSipNumber.sip013:
      return 'sft';
  }
}

export type SipEventContext = {
  tx_id: string;
  tx_index: number;
  event_index?: number;
};

export type SmartContractDeployment = SipEventContext & {
  principal: string;
  sip: DbSipNumber;
  fungible_token_name?: string;
  non_fungible_token_name?: string;
};

type MetadataUpdateMode = 'standard' | 'frozen' | 'dynamic';

export type TokenMetadataUpdateNotification = SipEventContext & {
  token_class: TokenClass;
  contract_id: string;
  update_mode: MetadataUpdateMode;
  token_ids?: bigint[];
  ttl?: bigint;
};

export type NftMintEvent = SipEventContext & {
  contractId: string;
  tokenId: bigint;
};

export type SftMintEvent = NftMintEvent & {
  amount: bigint;
  recipient: string;
};

/**
 * Takes in a contract log entry and returns a metadata update notification object if valid.
 * @param log - Contract log entry
 */
export function getContractLogMetadataUpdateNotification(
  transaction: DecodedStacksTransaction,
  event: StacksCoreContractEvent
): TokenMetadataUpdateNotification | undefined {
  const log = event.contract_event;
  const sender = transaction.decoded.auth.origin_condition.signer.address;
  try {
    // Validate that we have the correct SIP-019 payload structure.
    const value = decodeClarityValue<ClarityValueTuple>(log.raw_value);
    const notification = stringFromValue(value.data.notification);
    if (notification !== 'token-metadata-update') {
      return;
    }
    const payload = value.data.payload as ClarityValueTuple;
    const contractId = stringFromValue(payload.data['contract-id']);
    const tokenClass = stringFromValue(payload.data['token-class']);
    if (!['ft', 'nft'].includes(tokenClass)) {
      return;
    }

    // From SIP-019:
    // Either the contract_identifier field of the contract event must be equal to the
    // payload.contract-id (i.e., the event was produced by the contract that owns the metadata) or
    // the transaction's tx-sender principal should match the principal contained in the
    // notification's payload.contract-id (i.e., the STX address that sent the transaction which
    // emits the notification should match the owner of the token contract being updated).
    if (contractId !== log.contract_identifier && sender !== contractId.split('.')[0]) {
      return;
    }

    // Only NFT notifications provide token ids.
    let tokenIds: bigint[] | undefined;
    if (tokenClass === 'nft') {
      const tokenIdList = payload.data['token-ids'] as ClarityValueList<ClarityValueUInt>;
      if (tokenIdList) {
        tokenIds = tokenIdList.list.map(i => BigInt(i.value));
      }
    }

    let updateMode: MetadataUpdateMode = 'standard';
    const updateModeValue = payload.data['update-mode'];
    if (updateModeValue) {
      const modeStr = stringFromValue(updateModeValue);
      if (modeStr as MetadataUpdateMode) {
        updateMode = modeStr as MetadataUpdateMode;
      }
    }

    let ttl: bigint | undefined;
    const ttlValue = payload.data['ttl'];
    if (ttlValue && ttlValue.type_id === ClarityTypeID.UInt) {
      ttl = BigInt(ttlValue.value);
    }

    return {
      tx_id: transaction.tx.txid,
      tx_index: transaction.tx.tx_index,
      event_index: event.event_index,
      token_class: tokenClass as TokenClass,
      contract_id: contractId,
      token_ids: tokenIds,
      update_mode: updateMode,
      ttl: ttl,
    };
  } catch (error) {
    return;
  }
}

export function getContractLogSftMintEvent(
  transaction: DecodedStacksTransaction,
  event: StacksCoreContractEvent
): SftMintEvent | undefined {
  const log = event.contract_event;
  try {
    // Validate that we have the correct SIP-013 `sft_mint` payload structure.
    const value = decodeClarityValue<ClarityValueTuple>(log.raw_value);
    const type = stringFromValue(value.data.type);
    if (type !== 'sft_mint') {
      return;
    }
    const recipient = stringFromValue(value.data['recipient']);
    const tokenId = (value.data['token-id'] as ClarityValueUInt).value;
    const amount = (value.data['amount'] as ClarityValueUInt).value;

    return {
      tx_id: transaction.tx.txid,
      tx_index: transaction.tx.tx_index,
      event_index: event.event_index,
      contractId: log.contract_identifier,
      tokenId: BigInt(tokenId),
      amount: BigInt(amount),
      recipient: recipient,
    };
  } catch (error) {
    return;
  }
}

export function getSmartContractDeployment(
  transaction: DecodedStacksTransaction
): SmartContractDeployment | undefined {
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
    return {
      tx_id: transaction.tx.txid,
      tx_index: transaction.tx.tx_index,
      principal,
      sip,
      fungible_token_name: abi.fungible_tokens[0]?.name,
      non_fungible_token_name: abi.non_fungible_tokens[0]?.name,
    };
  }
}
