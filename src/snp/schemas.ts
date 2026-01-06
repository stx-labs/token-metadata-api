import { Static, Type } from '@sinclair/typebox';

const SnpBaseEventSchema = Type.Object({
  txid: Type.String(),
  event_index: Type.Number(),
});

export const SnpSmartContractPrintEventSchema = Type.Composite([
  SnpBaseEventSchema,
  Type.Object({
    type: Type.Literal('contract_event'),
    contract_event: Type.Object({
      contract_identifier: Type.String(),
      topic: Type.String(),
      raw_value: Type.String(),
    }),
  }),
]);
export type SnpSmartContractPrintEvent = Static<typeof SnpSmartContractPrintEventSchema>;

export const SnpNftMintEventSchema = Type.Composite([
  SnpBaseEventSchema,
  Type.Object({
    type: Type.Literal('nft_mint_event'),
    nft_mint_event: Type.Object({
      asset_identifier: Type.String(),
      recipient: Type.String(),
      raw_value: Type.String(),
    }),
  }),
]);
export type SnpNftMintEvent = Static<typeof SnpNftMintEventSchema>;

export const SnpNftBurnEventSchema = Type.Composite([
  SnpBaseEventSchema,
  Type.Object({
    type: Type.Literal('nft_burn_event'),
    nft_burn_event: Type.Object({
      asset_identifier: Type.String(),
      sender: Type.String(),
      raw_value: Type.String(),
    }),
  }),
]);
export type SnpNftBurnEvent = Static<typeof SnpNftBurnEventSchema>;

export const SnpFtMintEventSchema = Type.Composite([
  SnpBaseEventSchema,
  Type.Object({
    type: Type.Literal('ft_mint_event'),
    ft_mint_event: Type.Object({
      asset_identifier: Type.String(),
      recipient: Type.String(),
      amount: Type.String(),
    }),
  }),
]);
export type SnpFtMintEvent = Static<typeof SnpFtMintEventSchema>;

export const SnpFtBurnEventSchema = Type.Composite([
  SnpBaseEventSchema,
  Type.Object({
    type: Type.Literal('ft_burn_event'),
    ft_burn_event: Type.Object({
      asset_identifier: Type.String(),
      sender: Type.String(),
      amount: Type.String(),
    }),
  }),
]);
export type SnpFtBurnEvent = Static<typeof SnpFtBurnEventSchema>;

export const SnpEventSchema = Type.Union([
  SnpSmartContractPrintEventSchema,
  SnpNftMintEventSchema,
  SnpNftBurnEventSchema,
  SnpFtMintEventSchema,
  SnpFtBurnEventSchema,
]);
export type SnpEvent = Static<typeof SnpEventSchema>;

export const SnpTransactionSchema = Type.Object({
  status: Type.Union([
    Type.Literal('success'),
    Type.Literal('abort_by_response'),
    Type.Literal('abort_by_post_condition'),
  ]),
  txid: Type.String(),
  tx_index: Type.Number(),
  contract_interface: Type.Union([Type.Null(), Type.String()]),
});
export type SnpTransaction = Static<typeof SnpTransactionSchema>;

export const SnpBlockSchema = Type.Object({
  block_height: Type.Number(),
  index_block_hash: Type.String(),
  parent_index_block_hash: Type.String(),
  events: Type.Array(SnpEventSchema),
  transactions: Type.Array(SnpTransactionSchema),
});
export type SnpBlock = Static<typeof SnpBlockSchema>;
