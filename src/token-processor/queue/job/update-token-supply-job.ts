import { cvToHex, uintCV } from '@stacks/transactions';
import { ClarityValueUInt, decodeClarityValueToRepr } from '@stacks/codec';
import { DbSmartContract, DbToken, DbTokenType } from '../../../pg/types.js';
import { StacksNodeRpcClient } from '../../stacks-node/stacks-node-rpc-client.js';
import { SmartContractClarityError } from '../../util/errors.js';
import { Job } from './job.js';
import { PgNumeric, logger } from '@stacks/api-toolkit';

/**
 * Updates the total supply of a token in the database by calling the `get-total-supply` function
 * on its smart contract. Used by `JobQueue` to update the total supply of tokens after a re-org.
 * This job is only used for FTs and SFTs.
 */
export class UpdateTokenSupplyJob extends Job {
  private token?: DbToken;
  private contract?: DbSmartContract;

  async handler(): Promise<void> {
    const tokenId = this.job.token_supply_id;
    if (!tokenId) {
      return;
    }
    const [token, contract] = await this.db.sqlTransaction(async sql => {
      const token = await this.db.getToken({ id: tokenId });
      if (!token) {
        logger.warn(`UpdateTokenSupplyJob token not found id=${tokenId}`);
        return [undefined, undefined];
      }
      const contract = await this.db.getSmartContract({ id: token.smart_contract_id });
      if (!contract) {
        logger.warn(`UpdateTokenSupplyJob contract not found id=${token.smart_contract_id}`);
        return [token, undefined];
      }
      return [token, contract];
    });
    this.token = token;
    this.contract = contract;
    if (!token || !contract) return;

    const client = StacksNodeRpcClient.create({
      contractPrincipal: contract.principal,
      network: this.network,
    });
    logger.info(`UpdateTokenSupplyJob processing ${this.description()}`);
    switch (token.type) {
      case DbTokenType.ft:
        await this.handleFt(client, token);
        break;
      case DbTokenType.nft:
        throw new Error(`UpdateTokenSupplyJob does not support NFTs`);
      case DbTokenType.sft:
        await this.handleSft(client, token);
        break;
    }
  }

  description(): string {
    if (!this.token || !this.contract) {
      return 'UpdateTokenSupplyJob';
    }
    switch (this.token.type) {
      case DbTokenType.ft:
        return `FT SUPPLY ${this.contract.principal} (id=${this.token.id})`;
      case DbTokenType.nft:
        throw new Error(`UpdateTokenSupplyJob does not support NFTs`);
      case DbTokenType.sft:
        return `SFT SUPPLY ${this.contract.principal}#${this.token.token_number} (id=${this.token.id})`;
    }
  }

  private async handleFt(client: StacksNodeRpcClient, token: DbToken) {
    await this.updateTokenSupply(client, token);
  }

  private async handleSft(client: StacksNodeRpcClient, token: DbToken) {
    const arg = [this.uIntCv(token.token_number)];
    await this.updateTokenSupply(client, token, arg);
  }

  private async updateTokenSupply(
    client: StacksNodeRpcClient,
    token: DbToken,
    arg: ClarityValueUInt[] = []
  ) {
    let fTotalSupply: PgNumeric | undefined;
    try {
      const totalSupply = await client.readUIntFromContract('get-total-supply', arg);
      if (totalSupply) fTotalSupply = totalSupply.toString();
    } catch (error) {
      // We'll treat Clarity errors here as if the supply was `undefined` to accommodate ALEX's
      // wrapped tokens which return an error in `get-total-supply`.
      if (!(error instanceof SmartContractClarityError)) {
        throw error;
      }
    }
    if (!fTotalSupply) {
      logger.warn(`UpdateTokenSupplyJob total supply not found for ${this.description()}`);
      return;
    }
    await this.db.core.updateTokenSupply({ id: token.id, total_supply: fTotalSupply });
  }

  private uIntCv(n: bigint): ClarityValueUInt {
    const cv = uintCV(n);
    const hex = cvToHex(cv);
    return {
      value: n.toString(),
      hex: hex,
      repr: decodeClarityValueToRepr(hex),
    } as ClarityValueUInt;
  }
}
