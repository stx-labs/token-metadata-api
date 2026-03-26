import { DbJobInvalidReason } from './types.js';

export class TokenNotFoundError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

export class ContractNotFoundError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

export class TokenNotProcessedError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

export class TokenLocaleNotFoundError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

export class InvalidContractError extends Error {
  public reason: DbJobInvalidReason;
  constructor(reason: DbJobInvalidReason) {
    super();
    this.reason = reason;
    this.name = this.constructor.name;
  }
}

export class InvalidTokenError extends Error {
  public reason: DbJobInvalidReason;
  constructor(reason: DbJobInvalidReason) {
    super();
    this.reason = reason;
    this.name = this.constructor.name;
  }
}
