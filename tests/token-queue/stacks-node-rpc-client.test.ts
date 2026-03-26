import { strict as assert } from 'node:assert';
import {
  cvToHex,
  uintCV,
  getAddressFromPrivateKey,
  makeRandomPrivKey,
  noneCV,
} from '@stacks/transactions';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { ENV } from '../../src/env.js';
import { RetryableJobError } from '../../src/token-processor/queue/errors.js';
import { StacksNodeRpcClient } from '../../src/token-processor/stacks-node/stacks-node-rpc-client.js';
import {
  StacksNodeJsonParseError,
  StacksNodeHttpError,
} from '../../src/token-processor/util/errors.js';
import { beforeEach, describe, test } from 'node:test';

describe('StacksNodeRpcClient', () => {
  const nodeUrl = `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`;
  const contractAddr = 'SP176ZMV706NZGDDX8VSQRGMB7QN33BBDVZ6BMNHD';
  const contractName = 'project-indigo-act1';
  const contractPrincipal = `${contractAddr}.${contractName}`;
  let client: StacksNodeRpcClient;

  beforeEach(() => {
    const randomPrivKey = makeRandomPrivKey();
    const senderAddress = getAddressFromPrivateKey(randomPrivKey, 'mainnet');
    client = new StacksNodeRpcClient({
      contractPrincipal: contractPrincipal,
      senderAddress: senderAddress,
    });
  });

  test('node runtime errors get retried', async () => {
    const mockResponse = {
      okay: false,
      cause: 'Runtime(Foo(Bar))',
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    await assert.rejects(client.readStringFromContract('get-token-uri', []), RetryableJobError);
  });

  test('contract not found errors get retried', async () => {
    const mockResponse = {
      okay: false,
      cause: `Unchecked(NoSuchContract("${contractPrincipal}"))`,
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    await assert.rejects(client.readStringFromContract('get-token-uri', []), RetryableJobError);
  });

  test('other node errors fail immediately', async () => {
    const mockResponse = {
      okay: false,
      cause: 'Unchecked(Foo(Bar))',
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    await assert.rejects(
      client.readStringFromContract('get-token-uri', []),
      (err: unknown) => !(err instanceof RetryableJobError)
    );
    await assert.rejects(client.readStringFromContract('get-token-uri', []));
  });

  test('http errors are thrown', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(500, { message: 'Server Error' });
    setGlobalDispatcher(agent);

    await assert.rejects(
      client.readStringFromContract('get-token-uri', []),
      (err: unknown) => err instanceof StacksNodeHttpError
    );
  });

  test('json parse errors are thrown', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, 'not parseable');
    setGlobalDispatcher(agent);

    await assert.rejects(
      client.readStringFromContract('get-token-uri', []),
      (err: unknown) => err instanceof StacksNodeJsonParseError
    );
  });

  test('clarity value parse errors are not retried', async () => {
    const mockResponse = {
      okay: true,
      result: cvToHex(uintCV(5)), // `get-token-uri` will fail because this is a `uint`
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    await assert.rejects(client.readStringFromContract('get-token-uri', []), Error);
  });

  test('incorrect none uri strings are parsed as undefined', async () => {
    const mockResponse = {
      okay: true,
      result: cvToHex(noneCV()),
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/call-read/${contractAddr}/${contractName}/get-token-uri`,
        method: 'POST',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    assert.strictEqual(await client.readStringFromContract('get-token-uri', []), undefined);
  });

  test('contract ABI is returned correctly', async () => {
    const mockResponse = {
      functions: [
        {
          name: 'airdrop',
          access: 'private',
          args: [
            {
              name: 'tid',
              type: 'uint128',
            },
          ],
          outputs: {
            type: 'bool',
          },
        },
      ],
      variables: [
        {
          name: 'AIRDROP_COUNT_PER_MEMBER',
          type: 'uint128',
          access: 'constant',
        },
      ],
      maps: [
        {
          name: 'map_claimed_member_note',
          key: 'uint128',
          value: 'bool',
        },
      ],
      fungible_tokens: [
        {
          name: 'MEME',
        },
      ],
      non_fungible_tokens: [],
      epoch: 'Epoch24',
      clarity_version: 'Clarity2',
    };
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(nodeUrl)
      .intercept({
        path: `/v2/contracts/interface/${contractAddr}/${contractName}`,
        method: 'GET',
      })
      .reply(200, mockResponse);
    setGlobalDispatcher(agent);

    const abi = await client.readContractInterface();
    assert.notStrictEqual(abi, undefined);
    assert.strictEqual(abi?.fungible_tokens[0].name, 'MEME');
  });
});
