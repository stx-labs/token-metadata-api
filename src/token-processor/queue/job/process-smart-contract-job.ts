import { ENV } from '../../../env';
import { DbSipNumber, DbSmartContract } from '../../../pg/types';
import { Job } from './job';
import { StacksNodeRpcClient } from '../../stacks-node/stacks-node-rpc-client';
import { logger } from '@hirosystems/api-toolkit';

/**
 * Takes a token smart contract and enqueues all of its underlying tokens for metadata retrieval.
 */
export class ProcessSmartContractJob extends Job {
  private contract?: DbSmartContract;

  protected async handler(): Promise<void> {
    if (!this.job.smart_contract_id) {
      return;
    }
    const contract = await this.db.getSmartContract({ id: this.job.smart_contract_id });
    if (!contract) {
      logger.warn(`ProcessSmartContractJob contract not found id=${this.job.smart_contract_id}`);
      return;
    }
    this.contract = contract;
    switch (contract.sip) {
      case DbSipNumber.sip009:
        // NFT contracts expose their token count in `get-last-token-id`. We'll get that number
        // through a contract call and then queue that same number of tokens for metadata retrieval.
        const tokenCount = await this.getNftContractLastTokenId(contract);
        if (tokenCount) {
          await this.enqueueTokens(contract, tokenCount);
        }
        break;

      case DbSipNumber.sip010:
        // FT contracts only have 1 token to process. Do that immediately.
        await this.enqueueTokens(contract, 1n);
        break;

      case DbSipNumber.sip013:
        // SFT contracts need no additional work. Token mints will come via `print` events later on.
        break;
    }
  }

  description(): string {
    return this.contract
      ? `Smart Contact (${this.contract.sip}, ${this.contract.principal})`
      : `ProcessSmartContractJob`;
  }

  private async getNftContractLastTokenId(contract: DbSmartContract): Promise<bigint | undefined> {
    const client = StacksNodeRpcClient.create({
      contractPrincipal: contract.principal,
      network: this.network,
    });
    return await client.readUIntFromContract('get-last-token-id');
  }

  private async enqueueTokens(contract: DbSmartContract, tokenCount: bigint): Promise<void> {
    if (tokenCount === 0n) {
      return;
    }
    if (tokenCount > ENV.METADATA_MAX_NFT_CONTRACT_TOKEN_COUNT) {
      logger.warn(
        `ProcessSmartContractJob max token count exceeded for ${this.description()}: ${tokenCount}`
      );
      return;
    }
    await this.db.sqlWriteTransaction(async sql => {
      // Check if the contract still exists, as we might suffer a rollback while this job is in
      // flight.
      const recentContract = await this.db.getSmartContract({ principal: contract.principal });
      if (!recentContract) return;
      logger.info(
        `ProcessSmartContractJob enqueueing ${tokenCount} tokens for ${this.description()}`
      );
      await this.db.updateSmartContractTokenCount({ id: contract.id, count: tokenCount });
      await this.db.core.insertAndEnqueueSequentialTokens(sql, {
        smart_contract: contract,
        token_count: tokenCount,
      });
    });
  }
}
