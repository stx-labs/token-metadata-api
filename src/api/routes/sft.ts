import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  SftMetadataResponse,
  SftPrincipalParam,
  TokenIdParam,
  TokenQuerystringParams,
} from '../schemas.js';
import { handleTokenCache } from '../util/cache.js';
import { parseMetadataLocaleBundle } from '../util/helpers.js';
import { generateTokenErrorResponse, TokenErrorResponseSchema } from '../util/errors.js';

export const SftRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.addHook('preHandler', handleTokenCache);
  fastify.get(
    '/sft/:principal/:token_id',
    {
      schema: {
        operationId: 'getSftMetadata',
        summary: 'Semi-Fungible Token Metadata',
        description: 'Retrieves metadata for a SIP-013 Semi-Fungible Token',
        tags: ['Tokens'],
        params: Type.Object({
          principal: SftPrincipalParam,
          token_id: TokenIdParam,
        }),
        querystring: TokenQuerystringParams,
        response: {
          200: SftMetadataResponse,
          ...TokenErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const metadataBundle = await fastify.db.getTokenMetadataBundle({
          contractPrincipal: request.params.principal,
          tokenNumber: request.params.token_id,
          locale: request.query.locale,
        });
        await reply.send({
          token_uri: metadataBundle?.token?.uri ?? undefined,
          decimals: metadataBundle?.token?.decimals ?? undefined,
          total_supply: metadataBundle?.token?.total_supply?.toString() ?? undefined,
          metadata: parseMetadataLocaleBundle(metadataBundle?.metadataLocale),
        });
      } catch (error) {
        await generateTokenErrorResponse(error, reply);
      }
    }
  );
  done();
};
