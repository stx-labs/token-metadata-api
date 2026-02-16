import * as http from 'http';
import { PgStore } from '../src/pg/pg-store';
import { buildApiServer } from '../src/api/init';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { SmartContractDeployment } from '../src/token-processor/util/sip-validation';
import { DbJob, DbSipNumber, DbSmartContract, DbUpdateNotification } from '../src/pg/types';
import { waiter } from '@hirosystems/api-toolkit';
import {
  DecodedStacksBlock,
  DecodedStacksTransaction,
} from '../src/stacks-core/stacks-core-block-processor';
import {
  AnchorModeID,
  DecodedTxResult,
  PostConditionModeID,
  TransactionVersion,
  TxPayloadTypeID,
} from '@hirosystems/stacks-encoding-native-js';
import { ClarityAbi } from '@stacks/transactions';
import { NewBlockEventType } from '@stacks/node-publisher-client';

export type TestFastifyServer = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

export async function startTestApiServer(db: PgStore): Promise<TestFastifyServer> {
  return await buildApiServer({ db });
}

export async function startTimeoutServer(delay: number, port: number = 9999) {
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      res.statusCode = 200;
      res.end('Delayed response');
    }, delay);
  });
  server.on('error', e => console.log(e));
  const serverReady = waiter();
  server.listen(port, '0.0.0.0', () => serverReady.finish());
  await serverReady;
  return server;
}

export async function startTestResponseServer(
  response: string,
  statusCode: number = 200,
  port: number = 9999
) {
  const server = http.createServer((req, res) => {
    res.statusCode = statusCode;
    res.end(response);
  });
  server.on('error', e => console.log(e));
  const serverReady = waiter();
  server.listen(port, '0.0.0.0', () => serverReady.finish());
  await serverReady;
  return server;
}

export async function closeTestServer(server: http.Server) {
  const serverDone = waiter();
  server.close(err => {
    if (err) {
      console.log(err);
    }
    serverDone.finish();
  });
  await serverDone;
}

export const SIP_009_ABI: ClarityAbi = {
  maps: [
    {
      key: {
        tuple: [
          { name: 'id', type: 'uint128' },
          { name: 'operator', type: 'principal' },
          { name: 'owner', type: 'principal' },
        ],
      },
      name: 'approvals',
      value: 'bool',
    },
    {
      key: {
        tuple: [
          { name: 'operator', type: 'principal' },
          { name: 'owner', type: 'principal' },
        ],
      },
      name: 'approvals-all',
      value: 'bool',
    },
    {
      key: 'uint128',
      name: 'market',
      value: {
        tuple: [
          { name: 'commission', type: 'principal' },
          { name: 'price', type: 'uint128' },
        ],
      },
    },
    { key: 'principal', name: 'mint-pass', value: 'uint128' },
  ],
  functions: [
    {
      args: [
        { name: 'result', type: { response: { ok: 'bool', error: 'uint128' } } },
        { name: 'prior', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'check-err',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'operator', type: 'principal' },
        { name: 'owner', type: 'principal' },
      ],
      name: 'is-owned-or-approved',
      access: 'private',
      outputs: { type: 'bool' },
    },
    {
      args: [{ name: 'entry', type: 'uint128' }],
      name: 'mint-token-helper',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'mintPrice', type: 'uint128' },
        { name: 'payer', type: 'principal' },
      ],
      name: 'paymint-split',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'entry',
          type: {
            tuple: [
              { name: 'account', type: 'principal' },
              { name: 'limit', type: 'uint128' },
            ],
          },
        },
      ],
      name: 'set-mint-pass-helper',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'recipient', type: 'principal' },
        { name: 'id', type: 'uint128' },
      ],
      name: 'admin-mint-airdrop',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'entries', type: { list: { type: 'uint128', length: 20 } } }],
      name: 'batch-mint-token',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'entries',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'account', type: 'principal' },
                  { name: 'limit', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'batch-set-mint-pass',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'entries', type: { list: { type: 'uint128', length: 200 } } }],
      name: 'batch-upgrade-v1-to-v2',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'burn',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'comm', type: 'trait_reference' },
      ],
      name: 'buy-in-ustx',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'freeze-metadata',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'price', type: 'uint128' },
        { name: 'comm', type: 'trait_reference' },
      ],
      name: 'list-in-ustx',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'mint-token',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'new-administrator', type: 'principal' }],
      name: 'set-administrator',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'operator', type: 'principal' },
        { name: 'approved', type: 'bool' },
      ],
      name: 'set-approved',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'none' } } },
    },
    {
      args: [
        { name: 'operator', type: 'principal' },
        { name: 'approved', type: 'bool' },
      ],
      name: 'set-approved-all',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'none' } } },
    },
    {
      args: [
        { name: 'account', type: 'principal' },
        { name: 'limit', type: 'uint128' },
      ],
      name: 'set-mint-pass',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'new-token-uri', type: { 'string-ascii': { length: 80 } } }],
      name: 'set-token-uri',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'owner', type: 'principal' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'transfer',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'unlist-in-ustx',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'upgrade-v1-to-v2',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'get-last-token-id',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'get-listing-in-ustx',
      access: 'read_only',
      outputs: {
        type: {
          optional: {
            tuple: [
              { name: 'commission', type: 'principal' },
              { name: 'price', type: 'uint128' },
            ],
          },
        },
      },
    },
    {
      args: [{ name: 'account', type: 'principal' }],
      name: 'get-mint-pass-balance',
      access: 'read_only',
      outputs: { type: 'uint128' },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'get-owner',
      access: 'read_only',
      outputs: { type: { response: { ok: { optional: 'principal' }, error: 'none' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'get-token-uri',
      access: 'read_only',
      outputs: {
        type: {
          response: { ok: { optional: { 'string-ascii': { length: 246 } } }, error: 'none' },
        },
      },
    },
    {
      args: [
        { name: 'id', type: 'uint128' },
        { name: 'operator', type: 'principal' },
      ],
      name: 'is-approved',
      access: 'read_only',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
  ],
  variables: [
    { name: 'COLLECTION-MAX-SUPPLY', type: 'uint128', access: 'constant' },
    {
      name: 'ERR-ADD-MINT-PASS',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-COLLECTION-LIMIT-REACHED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-COULDNT-GET-NFT-OWNER',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-COULDNT-GET-V1-DATA',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-METADATA-FROZEN',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-MINT-PASS-LIMIT-REACHED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NFT-LISTED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NFT-NOT-LISTED-FOR-SALE',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-ADMINISTRATOR',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-AUTHORIZED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-FOUND',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-OWNER',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-PAYMENT-ADDRESS',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-PRICE-WAS-ZERO',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-WRONG-COMMISSION',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    { name: 'MINT-PRICE', type: 'uint128', access: 'constant' },
    { name: 'token-name', type: { 'string-ascii': { length: 13 } }, access: 'constant' },
    { name: 'token-symbol', type: { 'string-ascii': { length: 6 } }, access: 'constant' },
    { name: 'wallet-1', type: 'principal', access: 'constant' },
    { name: 'wallet-2', type: 'principal', access: 'constant' },
    { name: 'wallet-3', type: 'principal', access: 'constant' },
    { name: 'wallet-4', type: 'principal', access: 'constant' },
    { name: 'wallet-5', type: 'principal', access: 'constant' },
    { name: 'wallet-6', type: 'principal', access: 'constant' },
    { name: 'wallet-7', type: 'principal', access: 'constant' },
    { name: 'administrator', type: 'principal', access: 'variable' },
    {
      name: 'collection-mint-addresses',
      type: { list: { type: 'principal', length: 4 } },
      access: 'variable',
    },
    {
      name: 'collection-mint-shares',
      type: { list: { type: 'uint128', length: 4 } },
      access: 'variable',
    },
    { name: 'metadata-frozen', type: 'bool', access: 'variable' },
    { name: 'mint-counter', type: 'uint128', access: 'variable' },
    { name: 'token-uri', type: { 'string-ascii': { length: 246 } }, access: 'variable' },
  ],
  fungible_tokens: [],
  non_fungible_tokens: [{ name: 'crashpunks-v2', type: 'uint128' }],
};

export const SIP_010_ABI: ClarityAbi = {
  maps: [],
  functions: [
    {
      args: [
        { name: 'result', type: { response: { ok: 'bool', error: 'uint128' } } },
        { name: 'prior', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'check-err',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    { args: [], name: 'is-authorized-auth', access: 'private', outputs: { type: 'bool' } },
    {
      args: [
        {
          name: 'recipient',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
              { name: 'to', type: 'principal' },
            ],
          },
        },
      ],
      name: 'send-token',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amount', type: 'uint128' },
        { name: 'to', type: 'principal' },
        { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
      ],
      name: 'send-token-with-memo',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amountBonus', type: 'uint128' },
        { name: 'amount1', type: 'uint128' },
        { name: 'amount2', type: 'uint128' },
        { name: 'amount3', type: 'uint128' },
        { name: 'amount4', type: 'uint128' },
        { name: 'amount5', type: 'uint128' },
        { name: 'amountDefault', type: 'uint128' },
      ],
      name: 'set-coinbase-amounts',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'threshold1', type: 'uint128' },
        { name: 'threshold2', type: 'uint128' },
        { name: 'threshold3', type: 'uint128' },
        { name: 'threshold4', type: 'uint128' },
        { name: 'threshold5', type: 'uint128' },
      ],
      name: 'set-coinbase-thresholds',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'coreContract', type: 'principal' },
        { name: 'stacksHeight', type: 'uint128' },
      ],
      name: 'activate-token',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amount', type: 'uint128' },
        { name: 'owner', type: 'principal' },
      ],
      name: 'burn',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'convert-to-v2',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amount', type: 'uint128' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'mint',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'recipients',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
                  { name: 'to', type: 'principal' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'send-many',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'newUri', type: { optional: { 'string-utf8': { length: 256 } } } }],
      name: 'set-token-uri',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amount', type: 'uint128' },
        { name: 'from', type: 'principal' },
        { name: 'to', type: 'principal' },
        { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
      ],
      name: 'transfer',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'amountBonus', type: 'uint128' },
        { name: 'amount1', type: 'uint128' },
        { name: 'amount2', type: 'uint128' },
        { name: 'amount3', type: 'uint128' },
        { name: 'amount4', type: 'uint128' },
        { name: 'amount5', type: 'uint128' },
        { name: 'amountDefault', type: 'uint128' },
      ],
      name: 'update-coinbase-amounts',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'threshold1', type: 'uint128' },
        { name: 'threshold2', type: 'uint128' },
        { name: 'threshold3', type: 'uint128' },
        { name: 'threshold4', type: 'uint128' },
        { name: 'threshold5', type: 'uint128' },
      ],
      name: 'update-coinbase-thresholds',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'user', type: 'principal' }],
      name: 'get-balance',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-coinbase-amounts',
      access: 'read_only',
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                { name: 'coinbaseAmount1', type: 'uint128' },
                { name: 'coinbaseAmount2', type: 'uint128' },
                { name: 'coinbaseAmount3', type: 'uint128' },
                { name: 'coinbaseAmount4', type: 'uint128' },
                { name: 'coinbaseAmount5', type: 'uint128' },
                { name: 'coinbaseAmountBonus', type: 'uint128' },
                { name: 'coinbaseAmountDefault', type: 'uint128' },
              ],
            },
            error: 'none',
          },
        },
      },
    },
    {
      args: [],
      name: 'get-coinbase-thresholds',
      access: 'read_only',
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                { name: 'coinbaseThreshold1', type: 'uint128' },
                { name: 'coinbaseThreshold2', type: 'uint128' },
                { name: 'coinbaseThreshold3', type: 'uint128' },
                { name: 'coinbaseThreshold4', type: 'uint128' },
                { name: 'coinbaseThreshold5', type: 'uint128' },
              ],
            },
            error: 'uint128',
          },
        },
      },
    },
    {
      args: [],
      name: 'get-decimals',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-name',
      access: 'read_only',
      outputs: {
        type: { response: { ok: { 'string-ascii': { length: 15 } }, error: 'none' } },
      },
    },
    {
      args: [],
      name: 'get-symbol',
      access: 'read_only',
      outputs: {
        type: { response: { ok: { 'string-ascii': { length: 3 } }, error: 'none' } },
      },
    },
    {
      args: [],
      name: 'get-token-uri',
      access: 'read_only',
      outputs: {
        type: {
          response: { ok: { optional: { 'string-utf8': { length: 256 } } }, error: 'none' },
        },
      },
    },
    {
      args: [],
      name: 'get-total-supply',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
  ],
  variables: [
    { name: 'DECIMALS', type: 'uint128', access: 'constant' },
    {
      name: 'ERR_INVALID_COINBASE_AMOUNT',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_INVALID_COINBASE_THRESHOLD',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_TOKEN_ALREADY_ACTIVATED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_TOKEN_NOT_ACTIVATED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_UNAUTHORIZED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR_V1_BALANCE_NOT_FOUND',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    { name: 'MICRO_CITYCOINS', type: 'uint128', access: 'constant' },
    { name: 'STATE_ACTIVE', type: 'uint128', access: 'constant' },
    { name: 'STATE_DEPLOYED', type: 'uint128', access: 'constant' },
    { name: 'STATE_INACTIVE', type: 'uint128', access: 'constant' },
    { name: 'TOKEN_BONUS_PERIOD', type: 'uint128', access: 'constant' },
    { name: 'TOKEN_EPOCH_LENGTH', type: 'uint128', access: 'constant' },
    { name: 'coinbaseAmount1', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmount2', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmount3', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmount4', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmount5', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmountBonus', type: 'uint128', access: 'variable' },
    { name: 'coinbaseAmountDefault', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold1', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold2', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold3', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold4', type: 'uint128', access: 'variable' },
    { name: 'coinbaseThreshold5', type: 'uint128', access: 'variable' },
    { name: 'tokenActivated', type: 'bool', access: 'variable' },
    {
      name: 'tokenUri',
      type: { optional: { 'string-utf8': { length: 256 } } },
      access: 'variable',
    },
  ],
  fungible_tokens: [{ name: 'newyorkcitycoin' }],
  non_fungible_tokens: [],
};

export const SIP_013_ABI: ClarityAbi = {
  maps: [
    { key: 'principal', name: 'approved-contracts', value: 'bool' },
    {
      key: {
        tuple: [
          { name: 'owner', type: 'principal' },
          { name: 'token-id', type: 'uint128' },
        ],
      },
      name: 'token-balances',
      value: 'uint128',
    },
    {
      key: 'principal',
      name: 'token-owned',
      value: { list: { type: 'uint128', length: 200 } },
    },
    { key: 'uint128', name: 'token-supplies', value: 'uint128' },
  ],
  functions: [
    {
      args: [],
      name: 'check-is-approved',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [],
      name: 'check-is-owner',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'balance', type: 'uint128' },
      ],
      name: 'create-tuple-token-balance',
      access: 'private',
      outputs: {
        type: {
          tuple: [
            { name: 'balance', type: 'uint128' },
            { name: 'token-id', type: 'uint128' },
          ],
        },
      },
    },
    {
      args: [{ name: 'amount', type: 'uint128' }],
      name: 'decimals-to-fixed',
      access: 'private',
      outputs: { type: 'uint128' },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'who', type: 'principal' },
      ],
      name: 'get-balance-or-default',
      access: 'private',
      outputs: { type: 'uint128' },
    },
    { args: [], name: 'pow-decimals', access: 'private', outputs: { type: 'uint128' } },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'balance', type: 'uint128' },
        { name: 'owner', type: 'principal' },
      ],
      name: 'set-balance',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'item',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'recipient', type: 'principal' },
              { name: 'sender', type: 'principal' },
              { name: 'token-id', type: 'uint128' },
            ],
          },
        },
        { name: 'previous-response', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'transfer-many-fixed-iter',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'item',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'recipient', type: 'principal' },
              { name: 'sender', type: 'principal' },
              { name: 'token-id', type: 'uint128' },
            ],
          },
        },
        { name: 'previous-response', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'transfer-many-iter',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'item',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'memo', type: { buffer: { length: 34 } } },
              { name: 'recipient', type: 'principal' },
              { name: 'sender', type: 'principal' },
              { name: 'token-id', type: 'uint128' },
            ],
          },
        },
        { name: 'previous-response', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'transfer-many-memo-fixed-iter',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'item',
          type: {
            tuple: [
              { name: 'amount', type: 'uint128' },
              { name: 'memo', type: { buffer: { length: 34 } } },
              { name: 'recipient', type: 'principal' },
              { name: 'sender', type: 'principal' },
              { name: 'token-id', type: 'uint128' },
            ],
          },
        },
        { name: 'previous-response', type: { response: { ok: 'bool', error: 'uint128' } } },
      ],
      name: 'transfer-many-memo-iter',
      access: 'private',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'new-approved-contract', type: 'principal' }],
      name: 'add-approved-contract',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
      ],
      name: 'burn',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
      ],
      name: 'burn-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'mint',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'mint-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'owner', type: 'principal' },
        { name: 'approved', type: 'bool' },
      ],
      name: 'set-approved-contract',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'owner', type: 'principal' }],
      name: 'set-contract-owner',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'new-transferrable', type: 'bool' }],
      name: 'set-transferrable',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'transfer',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'transfer-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'transfers',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'recipient', type: 'principal' },
                  { name: 'sender', type: 'principal' },
                  { name: 'token-id', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'transfer-many',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'transfers',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'recipient', type: 'principal' },
                  { name: 'sender', type: 'principal' },
                  { name: 'token-id', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'transfer-many-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'transfers',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'memo', type: { buffer: { length: 34 } } },
                  { name: 'recipient', type: 'principal' },
                  { name: 'sender', type: 'principal' },
                  { name: 'token-id', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'transfer-many-memo',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        {
          name: 'transfers',
          type: {
            list: {
              type: {
                tuple: [
                  { name: 'amount', type: 'uint128' },
                  { name: 'memo', type: { buffer: { length: 34 } } },
                  { name: 'recipient', type: 'principal' },
                  { name: 'sender', type: 'principal' },
                  { name: 'token-id', type: 'uint128' },
                ],
              },
              length: 200,
            },
          },
        },
      ],
      name: 'transfer-many-memo-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
        { name: 'recipient', type: 'principal' },
        { name: 'memo', type: { buffer: { length: 34 } } },
      ],
      name: 'transfer-memo',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'amount', type: 'uint128' },
        { name: 'sender', type: 'principal' },
        { name: 'recipient', type: 'principal' },
        { name: 'memo', type: { buffer: { length: 34 } } },
      ],
      name: 'transfer-memo-fixed',
      access: 'public',
      outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
    },
    {
      args: [{ name: 'amount', type: 'uint128' }],
      name: 'fixed-to-decimals',
      access: 'read_only',
      outputs: { type: 'uint128' },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'who', type: 'principal' },
      ],
      name: 'get-balance',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'who', type: 'principal' },
      ],
      name: 'get-balance-fixed',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-contract-owner',
      access: 'read_only',
      outputs: { type: { response: { ok: 'principal', error: 'none' } } },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-decimals',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'who', type: 'principal' }],
      name: 'get-overall-balance',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'who', type: 'principal' }],
      name: 'get-overall-balance-fixed',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-overall-supply',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-overall-supply-fixed',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'owner', type: 'principal' }],
      name: 'get-token-balance-owned-in-fixed',
      access: 'read_only',
      outputs: {
        type: {
          list: {
            type: {
              tuple: [
                { name: 'balance', type: 'uint128' },
                { name: 'token-id', type: 'uint128' },
              ],
            },
            length: 200,
          },
        },
      },
    },
    {
      args: [{ name: 'owner', type: 'principal' }],
      name: 'get-token-owned',
      access: 'read_only',
      outputs: { type: { list: { type: 'uint128', length: 200 } } },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-token-uri',
      access: 'read_only',
      outputs: {
        type: {
          response: { ok: { optional: { 'string-utf8': { length: 256 } } }, error: 'none' },
        },
      },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-total-supply',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-total-supply-fixed',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [],
      name: 'get-transferrable',
      access: 'read_only',
      outputs: { type: { response: { ok: 'bool', error: 'none' } } },
    },
  ],
  variables: [
    {
      name: 'ERR-INVALID-BALANCE',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-NOT-AUTHORIZED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-TOO-MANY-POOLS',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    {
      name: 'ERR-TRANSFER-FAILED',
      type: { response: { ok: 'none', error: 'uint128' } },
      access: 'constant',
    },
    { name: 'ONE_8', type: 'uint128', access: 'constant' },
    { name: 'contract-owner', type: 'principal', access: 'variable' },
    { name: 'token-decimals', type: 'uint128', access: 'variable' },
    { name: 'token-name', type: { 'string-ascii': { length: 32 } }, access: 'variable' },
    { name: 'token-symbol', type: { 'string-ascii': { length: 32 } }, access: 'variable' },
    {
      name: 'token-uri',
      type: { optional: { 'string-utf8': { length: 256 } } },
      access: 'variable',
    },
    { name: 'transferrable', type: 'bool', access: 'variable' },
  ],
  fungible_tokens: [{ name: 'key-alex-autoalex-v1' }],
  non_fungible_tokens: [],
};

export async function insertAndEnqueueTestContract(
  db: PgStore,
  principal: string,
  sip: DbSipNumber,
  tx_id?: string
): Promise<DbJob> {
  return await db.sqlWriteTransaction(async sql => {
    const block: DecodedStacksBlock = {
      block_height: 1,
      index_block_hash: '0x000001',
      parent_index_block_hash: '0x000000',
      transactions: [],
    };
    const deploy: SmartContractDeployment = {
      principal,
      sip,
      fungible_token_name: sip == DbSipNumber.sip010 ? 'ft-token' : undefined,
      tx_id: tx_id ?? '0x123456',
      tx_index: 0,
    };
    await db.core.insertBlock(sql, block);
    await db.core.applyContractDeployment(sql, deploy, block);
    const smart_contract = (await db.getSmartContract({ principal })) as DbSmartContract;

    const jobs = await sql<DbJob[]>`
      SELECT * FROM jobs WHERE smart_contract_id = ${smart_contract.id}
    `;
    return jobs[0];
  });
}

export async function insertAndEnqueueTestContractWithTokens(
  db: PgStore,
  principal: string,
  sip: DbSipNumber,
  token_count: bigint,
  tx_id?: string
): Promise<DbJob[]> {
  return await db.sqlWriteTransaction(async sql => {
    await insertAndEnqueueTestContract(db, principal, sip, tx_id);
    const smart_contract = (await db.getSmartContract({ principal })) as DbSmartContract;
    await db.core.insertAndEnqueueSequentialTokens(sql, {
      smart_contract,
      token_count,
    });
    return await sql<DbJob[]>`
      SELECT * FROM jobs WHERE token_id IN (
        SELECT id FROM tokens WHERE smart_contract_id = ${smart_contract.id}
      )
    `;
  });
}

export async function markAllJobsAsDone(db: PgStore): Promise<void> {
  await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
}

export async function getTokenCount(db: PgStore): Promise<string> {
  const result = await db.sql<{ count: string }[]>`SELECT COUNT(*) FROM tokens`;
  return result[0].count;
}

export async function getJobCount(db: PgStore): Promise<string> {
  const result = await db.sql<{ count: string }[]>`SELECT COUNT(*) FROM jobs`;
  return result[0].count;
}

export async function getLatestTokenNotification(
  db: PgStore,
  tokenId: number
): Promise<DbUpdateNotification | undefined> {
  const result = await db.sql<DbUpdateNotification[]>`
    SELECT *
    FROM update_notifications
    WHERE token_id = ${tokenId}
    ORDER BY block_height DESC, tx_index DESC, event_index DESC
    LIMIT 1
  `;
  if (result.count) {
    return result[0];
  }
}

export async function getLatestContractTokenNotifications(
  db: PgStore,
  contractId: string
): Promise<DbUpdateNotification[]> {
  return await db.sql<DbUpdateNotification[]>`
    WITH token_ids AS (
      SELECT t.id
      FROM tokens AS t
      INNER JOIN smart_contracts AS s ON s.id = t.smart_contract_id
      WHERE s.principal = ${contractId}
    )
    SELECT DISTINCT ON (token_id) *
    FROM update_notifications
    WHERE token_id IN (SELECT id FROM token_ids)
    ORDER BY token_id, block_height DESC, tx_index DESC, event_index DESC
  `;
}

export type TestTransactionArgs = {
  tx_id?: string;
  tx_index?: number;
  sender?: string;
  status?: 'success' | 'abort_by_response' | 'abort_by_post_condition';
  contract_interface?: ClarityAbi;
};

export class TestTransactionBuilder {
  private readonly transaction: DecodedStacksTransaction;

  constructor(args: TestTransactionArgs) {
    this.transaction = {
      tx: {
        txid: args.tx_id ?? '0x01',
        tx_index: args.tx_index ?? 0,
        raw_tx: '',
        status: args.status ?? 'success',
        contract_interface: args.contract_interface ?? null,
        raw_result: '',
        execution_cost: {
          read_count: 0,
          read_length: 0,
          runtime: 0,
          write_count: 0,
          write_length: 0,
        },
        microblock_sequence: null,
        microblock_hash: null,
        microblock_parent_hash: null,
      },
      decoded: {
        auth: {
          origin_condition: {
            signer: {
              address: args.sender ?? 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
            },
          },
        } as DecodedTxResult['auth'],
        tx_id: args.tx_id ?? '0x01',
        version: TransactionVersion.Mainnet,
        chain_id: 1,
        anchor_mode: AnchorModeID.Any,
        post_condition_mode: PostConditionModeID.Deny,
        post_conditions: [],
        post_conditions_buffer: '',
        payload: {
          type_id: TxPayloadTypeID.Coinbase,
          payload_buffer: '',
        },
      },
      events: [],
    };
  }

  setSmartContractPayload(contract_name: string, abi: ClarityAbi): TestTransactionBuilder {
    this.transaction.decoded.payload = {
      type_id: TxPayloadTypeID.SmartContract,
      contract_name,
      code_body: 'some-code-body',
    };
    this.transaction.tx.contract_interface = abi;
    return this;
  }

  addFtMintEvent(
    asset_identifier: string,
    recipient: string,
    amount: string
  ): TestTransactionBuilder {
    this.transaction.events.push({
      type: NewBlockEventType.FtMint,
      ft_mint_event: {
        asset_identifier,
        recipient,
        amount,
      },
      event_index: this.transaction.events.length,
      txid: this.transaction.tx.txid,
      committed: true,
    });
    return this;
  }

  addFtBurnEvent(asset_identifier: string, sender: string, amount: string): TestTransactionBuilder {
    this.transaction.events.push({
      type: NewBlockEventType.FtBurn,
      ft_burn_event: {
        asset_identifier,
        sender,
        amount,
      },
      event_index: this.transaction.events.length,
      txid: this.transaction.tx.txid,
      committed: true,
    });
    return this;
  }

  addNftMintEvent(
    asset_identifier: string,
    recipient: string,
    raw_value: string
  ): TestTransactionBuilder {
    this.transaction.events.push({
      type: NewBlockEventType.NftMint,
      nft_mint_event: {
        asset_identifier,
        recipient,
        raw_value,
        value: raw_value,
      },
      event_index: this.transaction.events.length,
      txid: this.transaction.tx.txid,
      committed: true,
    });
    return this;
  }

  addContractEvent(contract_identifier: string, raw_value: string): TestTransactionBuilder {
    this.transaction.events.push({
      type: NewBlockEventType.Contract,
      contract_event: {
        contract_identifier,
        topic: 'print',
        raw_value,
        value: raw_value,
      },
      event_index: this.transaction.events.length,
      txid: this.transaction.tx.txid,
      committed: true,
    });
    return this;
  }

  build(): DecodedStacksTransaction {
    return this.transaction;
  }
}

export type TestBlockArgs = {
  block_height?: number;
  index_block_hash?: string;
  parent_index_block_hash?: string;
};

export class TestBlockBuilder {
  private readonly block: DecodedStacksBlock;

  constructor(args: TestBlockArgs) {
    this.block = {
      block_height: args.block_height ?? 1,
      index_block_hash: args.index_block_hash ?? '0x000001',
      parent_index_block_hash: args.parent_index_block_hash ?? '0x000000',
      transactions: [],
    };
  }

  addTransaction(transaction: DecodedStacksTransaction): TestBlockBuilder {
    this.block.transactions.push(transaction);
    return this;
  }

  build(): DecodedStacksBlock {
    return this.block;
  }
}
