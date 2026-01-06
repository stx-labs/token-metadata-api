import { Value } from '@sinclair/typebox/value';
import { FastifyReply } from 'fastify';
import {
  ErrorResponse,
  TokenLocaleNotFoundResponse,
  TokenNotFoundResponse,
  TokenNotProcessedResponse,
  NotFoundResponse,
  ContractNotFoundResponse,
} from '../schemas';
import {
  ContractNotFoundError,
  InvalidContractError,
  InvalidTokenError,
  TokenLocaleNotFoundError,
  TokenNotFoundError,
  TokenNotProcessedError,
} from '../../pg/errors';
import { setReplyNonCacheable } from './cache';
import { DbJobInvalidReason } from '../../pg/types';

export const TokenErrorResponseSchema = {
  404: NotFoundResponse,
  422: ErrorResponse,
};

export async function generateTokenErrorResponse(error: any, reply: FastifyReply) {
  setReplyNonCacheable(reply);
  if (error instanceof TokenNotFoundError) {
    await reply.code(404).send(Value.Create(TokenNotFoundResponse));
  } else if (error instanceof ContractNotFoundError) {
    await reply.code(404).send(Value.Create(ContractNotFoundResponse));
  } else if (error instanceof TokenNotProcessedError) {
    await reply.code(422).send(Value.Create(TokenNotProcessedResponse));
  } else if (error instanceof TokenLocaleNotFoundError) {
    await reply.code(422).send(Value.Create(TokenLocaleNotFoundResponse));
  } else if (error instanceof InvalidContractError || error instanceof InvalidTokenError) {
    let message = 'Unknown error';
    switch (error.reason) {
      case DbJobInvalidReason.metadataSizeExceeded:
        message = 'Metadata size is too large to process';
        break;
      case DbJobInvalidReason.imageSizeExceeded:
        message = 'Image size is too large to process';
        break;
      case DbJobInvalidReason.metadataTimeout:
        message = 'Metadata could not be processed because it took too long to respond';
        break;
      case DbJobInvalidReason.imageTimeout:
        message = 'Image could not be processed because it took too long to respond';
        break;
      case DbJobInvalidReason.metadataParseFailed:
        message = 'Metadata could not be parsed or it does not conform to SIP-016';
        break;
      case DbJobInvalidReason.imageParseFailed:
        message = 'Image processing failed because it could not be parsed';
        break;
      case DbJobInvalidReason.metadataHttpError:
        message = 'Metadata could not be processed because the server responded with an error';
        break;
      case DbJobInvalidReason.imageHttpError:
        message = 'Image could not be processed because the server responded with an error';
        break;
      case DbJobInvalidReason.tokenContractClarityError:
        message = 'The token contract produced a Clarity error when trying to fetch metadata';
        break;
    }
    await reply.code(422).send({ error: 'Token error', message });
  } else {
    throw error;
  }
}
