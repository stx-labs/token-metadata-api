import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { SearchQuerystringParams, SearchResponse } from '../schemas.js';
import { handleBulkTokenCache } from '../util/cache.js';
import { parseContractIdentifiers } from '../util/helpers.js';

export const SearchRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.addHook('preHandler', handleBulkTokenCache);
  fastify.get(
    '/search',
    {
      schema: {
        operationId: 'searchTokens',
        summary: 'Search Tokens',
        description:
          'Retrieves metadata for multiple tokens in a single request. Accepts up to 50 contract identifiers.',
        tags: ['Tokens'],
        querystring: SearchQuerystringParams,
        response: {
          200: SearchResponse,
        },
      },
    },
    async (request, reply) => {
      const pairs = parseContractIdentifiers(request.query.contract);
      const results = await fastify.db.getBulkTokenMetadata({
        pairs,
        locale: request.query.locale,
      });
      await reply.send(
        results.map(r => ({
          contract_id: r.principal,
          token_number: Number(r.token_number),
          token_type: r.token_type,
          name: r.name ?? undefined,
          symbol: r.symbol ?? undefined,
          decimals: r.decimals ?? undefined,
          total_supply: r.total_supply ?? undefined,
          token_uri: r.uri ?? undefined,
          description: r.description ?? undefined,
          image_uri: r.cached_image ?? undefined,
          image_thumbnail_uri: r.cached_thumbnail_image ?? undefined,
          image_canonical_uri: r.image ?? undefined,
          tx_id: r.tx_id,
          sender_address: r.principal.split('.')[0],
        }))
      );
    }
  );
  done();
};
