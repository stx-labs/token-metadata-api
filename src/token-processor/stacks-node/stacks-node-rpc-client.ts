import codec from '@stacks/codec';
import { request, errors } from 'undici';
import { ENV } from '../../env.js';
import { RetryableJobError } from '../queue/errors.js';
import {
  SmartContractClarityError,
  StacksNodeJsonParseError,
  StacksNodeHttpError,
} from '../util/errors.js';
import { ClarityAbi, getAddressFromPrivateKey, makeRandomPrivKey } from '@stacks/transactions';
import { StacksNetworkName } from '@stacks/network';

interface ReadOnlyContractCallSuccessResponse {
  okay: true;
  result: string;
}

interface ReadOnlyContractCallFailResponse {
  okay: false;
  cause: string;
}

export type ReadOnlyContractCallResponse =
  | ReadOnlyContractCallSuccessResponse
  | ReadOnlyContractCallFailResponse;

/**
 * Performs read-only contract calls against a configured Stacks node. Performs type checking and
 * returns data as decoded Clarity values.
 */
export class StacksNodeRpcClient {
  private readonly contractAddress: string;
  private readonly contractName: string;
  private readonly senderAddress: string;
  private readonly basePath: string;

  static create(args: {
    contractPrincipal: string;
    network: StacksNetworkName;
  }): StacksNodeRpcClient {
    const randomPrivKey = makeRandomPrivKey();
    const senderAddress = getAddressFromPrivateKey(randomPrivKey, args.network);
    const client = new StacksNodeRpcClient({
      contractPrincipal: args.contractPrincipal,
      senderAddress: senderAddress,
    });
    return client;
  }

  constructor(args: { contractPrincipal: string; senderAddress: string }) {
    [this.contractAddress, this.contractName] = args.contractPrincipal.split('.');
    this.senderAddress = args.senderAddress;
    this.basePath = `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`;
  }

  async readStringFromContract(
    functionName: string,
    functionArgs: codec.ClarityValue[] = []
  ): Promise<string | undefined> {
    const clarityValue = await this.makeReadOnlyContractCall(functionName, functionArgs);
    return this.checkAndParseString(clarityValue);
  }

  async readUIntFromContract(
    functionName: string,
    functionArgs: codec.ClarityValue[] = []
  ): Promise<bigint | undefined> {
    const clarityValue = await this.makeReadOnlyContractCall(functionName, functionArgs);
    const uintVal = this.checkAndParseUintCV(clarityValue);
    try {
      return BigInt(uintVal.value.toString());
    } catch (error) {
      throw new SmartContractClarityError(`Invalid uint value '${uintVal.value}'`);
    }
  }

  async readContractInterface(): Promise<ClarityAbi | undefined> {
    const url = `${this.basePath}/v2/contracts/interface/${this.contractAddress}/${this.contractName}`;
    try {
      const result = await request(url, {
        method: 'GET',
      });
      const text = await result.body.text();
      if (result.statusCode >= 400) {
        throw new StacksNodeHttpError(
          `${url}: HTTP ${result.statusCode} ${result.statusText || ''} ${text}`.trim()
        );
      }
      try {
        return JSON.parse(text) as ClarityAbi;
      } catch (error) {
        throw new StacksNodeJsonParseError(`JSON parse error ${url}: ${text}`);
      }
    } catch (error) {
      if (error instanceof errors.UndiciError) {
        throw new StacksNodeHttpError(`${url}: ${error}`);
      }
      throw error;
    }
  }

  private async sendReadOnlyContractCall(
    functionName: string,
    functionArgs: codec.ClarityValue[]
  ): Promise<ReadOnlyContractCallResponse> {
    const body = {
      sender: this.senderAddress,
      arguments: functionArgs.map(arg => arg.hex),
    };
    const url = `${this.basePath}/v2/contracts/call-read/${this.contractAddress}/${this.contractName}/${functionName}`;
    try {
      const result = await request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await result.body.text();
      if (result.statusCode >= 400) {
        throw new StacksNodeHttpError(
          `${url}: HTTP ${result.statusCode} ${result.statusText || ''} ${text}`.trim()
        );
      }
      try {
        return JSON.parse(text) as ReadOnlyContractCallResponse;
      } catch (error) {
        throw new StacksNodeJsonParseError(`JSON parse error ${url}: ${text}`);
      }
    } catch (error) {
      if (error instanceof errors.UndiciError) {
        throw new StacksNodeHttpError(`${url}: ${error}`);
      }
      throw error;
    }
  }

  private async makeReadOnlyContractCall(
    functionName: string,
    functionArgs: codec.ClarityValue[]
  ): Promise<codec.ClarityValue> {
    const result = await this.sendReadOnlyContractCall(functionName, functionArgs);
    if (!result.okay) {
      if (result.cause.startsWith('Runtime')) {
        throw new RetryableJobError(
          `Runtime error while calling read-only function ${functionName}`
        );
      } else if (result.cause.includes('NoSuchContract')) {
        throw new RetryableJobError(
          `Contract not available yet when calling read-only function ${functionName}`
        );
      }
      throw new SmartContractClarityError(`Read-only error ${functionName}: ${result.cause}`);
    }
    return codec.decodeClarityValue(result.result);
  }

  private unwrapClarityType(clarityValue: codec.ClarityValue): codec.ClarityValue {
    let unwrappedClarityValue: codec.ClarityValue = clarityValue;
    while (
      unwrappedClarityValue.type_id === codec.ClarityTypeID.ResponseOk ||
      unwrappedClarityValue.type_id === codec.ClarityTypeID.OptionalSome
    ) {
      unwrappedClarityValue = unwrappedClarityValue.value;
    }
    return unwrappedClarityValue;
  }

  private checkAndParseUintCV(responseCV: codec.ClarityValue): codec.ClarityValueUInt {
    const unwrappedClarityValue = this.unwrapClarityType(responseCV);
    if (unwrappedClarityValue.type_id === codec.ClarityTypeID.UInt) {
      return unwrappedClarityValue;
    }
    throw new SmartContractClarityError(
      `Unexpected Clarity type '${unwrappedClarityValue.type_id}' while unwrapping uint`
    );
  }

  private checkAndParseString(responseCV: codec.ClarityValue): string | undefined {
    const unwrappedClarityValue = this.unwrapClarityType(responseCV);
    if (
      unwrappedClarityValue.type_id === codec.ClarityTypeID.StringAscii ||
      unwrappedClarityValue.type_id === codec.ClarityTypeID.StringUtf8
    ) {
      return unwrappedClarityValue.data;
    } else if (unwrappedClarityValue.type_id === codec.ClarityTypeID.OptionalNone) {
      return undefined;
    }
    throw new SmartContractClarityError(
      `Unexpected Clarity type '${unwrappedClarityValue.type_id}' while unwrapping string`
    );
  }
}
