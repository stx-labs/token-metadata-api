import { Static, Type } from '@sinclair/typebox';

const StacksCoreBaseEventSchema = Type.Object({
  txid: Type.String(),
  event_index: Type.Number(),
});

export const StacksCoreContractEventSchema = Type.Composite([
  StacksCoreBaseEventSchema,
  Type.Object({
    type: Type.Literal('contract_event'),
    contract_event: Type.Object({
      contract_identifier: Type.String(),
      topic: Type.String(),
      raw_value: Type.String(),
    }),
  }),
]);
export type StacksCoreContractEvent = Static<typeof StacksCoreContractEventSchema>;

export const StacksCoreNftMintEventSchema = Type.Composite([
  StacksCoreBaseEventSchema,
  Type.Object({
    type: Type.Literal('nft_mint_event'),
    nft_mint_event: Type.Object({
      asset_identifier: Type.String(),
      recipient: Type.String(),
      raw_value: Type.String(),
    }),
  }),
]);
export type StacksCoreNftMintEvent = Static<typeof StacksCoreNftMintEventSchema>;

export const StacksCoreNftBurnEventSchema = Type.Composite([
  StacksCoreBaseEventSchema,
  Type.Object({
    type: Type.Literal('nft_burn_event'),
    nft_burn_event: Type.Object({
      asset_identifier: Type.String(),
      sender: Type.String(),
      raw_value: Type.String(),
    }),
  }),
]);
export type StacksCoreNftBurnEvent = Static<typeof StacksCoreNftBurnEventSchema>;

export const StacksCoreFtMintEventSchema = Type.Composite([
  StacksCoreBaseEventSchema,
  Type.Object({
    type: Type.Literal('ft_mint_event'),
    ft_mint_event: Type.Object({
      asset_identifier: Type.String(),
      recipient: Type.String(),
      amount: Type.String(),
    }),
  }),
]);
export type StacksCoreFtMintEvent = Static<typeof StacksCoreFtMintEventSchema>;

export const StacksCoreFtBurnEventSchema = Type.Composite([
  StacksCoreBaseEventSchema,
  Type.Object({
    type: Type.Literal('ft_burn_event'),
    ft_burn_event: Type.Object({
      asset_identifier: Type.String(),
      sender: Type.String(),
      amount: Type.String(),
    }),
  }),
]);
export type StacksCoreFtBurnEvent = Static<typeof StacksCoreFtBurnEventSchema>;

export const StacksCoreEventSchema = Type.Union([
  StacksCoreContractEventSchema,
  StacksCoreNftMintEventSchema,
  StacksCoreNftBurnEventSchema,
  StacksCoreFtMintEventSchema,
  StacksCoreFtBurnEventSchema,
]);
export type StacksCoreEvent = Static<typeof StacksCoreEventSchema>;

export const StacksCoreTransactionSchema = Type.Object({
  raw_tx: Type.String(),
  status: Type.Union([
    Type.Literal('success'),
    Type.Literal('abort_by_response'),
    Type.Literal('abort_by_post_condition'),
  ]),
  txid: Type.String(),
  tx_index: Type.Number(),
  contract_interface: Type.Union([Type.Null(), Type.String()]),
});
export type StacksCoreTransaction = Static<typeof StacksCoreTransactionSchema>;

export const StacksCoreBlockSchema = Type.Object({
  block_height: Type.Number(),
  index_block_hash: Type.String(),
  parent_index_block_hash: Type.String(),
  events: Type.Array(StacksCoreEventSchema),
  transactions: Type.Array(StacksCoreTransactionSchema),
});
export type StacksCoreBlock = Static<typeof StacksCoreBlockSchema>;
