import { errors } from 'undici';
import { parseRetryAfterResponseHeader } from './helpers.js';
import { DbJobInvalidReason } from '../../pg/types.js';

export interface UndiciCauseTypeError extends TypeError {
  cause?: unknown;
}

/** Tags an error as a user error i.e. caused by a bad contract, incorrect SIP-016 metadata, etc. */
export class UserError extends Error {}

/** Thrown when fetching metadata exceeds the max allowed byte size */
export class MetadataSizeExceededError extends UserError {
  constructor(message: string) {
    super();
    this.message = message;
    this.name = this.constructor.name;
  }
}

export class ImageSizeExceededError extends MetadataSizeExceededError {}

/** Thrown when fetching metadata exceeds the max allowed timeout */
export class MetadataTimeoutError extends UserError {
  public url: URL;

  constructor(url: URL) {
    super();
    this.url = url;
    this.name = this.constructor.name;
  }
}

export class ImageTimeoutError extends MetadataTimeoutError {}

/** Thrown when there is a parse error that prevented metadata processing */
export class MetadataParseError extends UserError {
  constructor(message: string) {
    super();
    this.message = message;
    this.name = this.constructor.name;
  }
}

export class ImageParseError extends MetadataParseError {}

export class SmartContractClarityError extends UserError {
  constructor(message: string) {
    super();
    this.message = message;
    this.name = this.constructor.name;
  }
}

export class MetadataHttpError extends UserError {
  public cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super();
    this.message = message;
    this.name = this.constructor.name;
    this.cause = cause;
  }
}

export class ImageHttpError extends MetadataHttpError {}

export class TooManyRequestsHttpError extends Error {
  public url: URL;
  /** `Retry-After` header value in seconds, if any. */
  public retryAfter?: number;

  constructor(url: URL, error: errors.ResponseError) {
    super(url.toString());
    this.name = this.constructor.name;
    this.url = url;
    this.retryAfter = parseRetryAfterResponseHeader(error);
  }
}

export class StacksNodeJsonParseError extends Error {
  constructor(message: string) {
    super();
    this.message = message;
    this.name = this.constructor.name;
  }
}

export class StacksNodeHttpError extends Error {
  constructor(message: string) {
    super();
    this.message = message;
    this.name = this.constructor.name;
  }
}

export function getUserErrorInvalidReason(error: UserError): DbJobInvalidReason {
  switch (true) {
    case error instanceof ImageSizeExceededError:
      return DbJobInvalidReason.imageSizeExceeded;
    case error instanceof MetadataSizeExceededError:
      return DbJobInvalidReason.metadataSizeExceeded;
    case error instanceof ImageTimeoutError:
      return DbJobInvalidReason.imageTimeout;
    case error instanceof MetadataTimeoutError:
      return DbJobInvalidReason.metadataTimeout;
    case error instanceof ImageParseError:
      return DbJobInvalidReason.imageParseFailed;
    case error instanceof MetadataParseError:
      return DbJobInvalidReason.metadataParseFailed;
    case error instanceof ImageHttpError:
      return DbJobInvalidReason.imageHttpError;
    case error instanceof MetadataHttpError:
      return DbJobInvalidReason.metadataHttpError;
    case error instanceof SmartContractClarityError:
      return DbJobInvalidReason.tokenContractClarityError;
    default:
      return DbJobInvalidReason.unknown;
  }
}
