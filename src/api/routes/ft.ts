import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  FtBasicMetadataResponse,
  FtMetadataResponse,
  FtOrderBy,
  FtOrderByParam,
  FtPrincipalParam,
  LimitParam,
  OffsetParam,
  Order,
  OrderParam,
  PaginatedResponse,
  StacksAddressParam,
  TokenQuerystringParams,
} from '../schemas.js';
import { handleChainTipCache, handleTokenCache } from '../util/cache.js';
import { generateTokenErrorResponse, TokenErrorResponseSchema } from '../util/errors.js';
import { parseMetadataLocaleBundle } from '../util/helpers.js';

const IndexRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _options,
  done
) => {
  fastify.addHook('preHandler', handleChainTipCache);
  fastify.get(
    '/ft',
    {
      schema: {
        operationId: 'getFungibleTokens',
        summary: 'Fungible Tokens',
        description: 'Retrieves a list of Fungible Tokens',
        tags: ['Tokens'],
        querystring: Type.Object({
          name: Type.Optional(Type.String()),
          symbol: Type.Optional(Type.String()),
          address: Type.Optional(StacksAddressParam),
          valid_metadata_only: Type.Optional(
            Type.Boolean({
              description: 'If enabled, only tokens with valid SIP-016 metadata will be returned',
            })
          ),
          // Pagination
          offset: Type.Optional(OffsetParam),
          limit: Type.Optional(LimitParam),
          // Ordering
          order_by: Type.Optional(FtOrderByParam),
          order: Type.Optional(OrderParam),
        }),
        response: {
          200: PaginatedResponse(FtBasicMetadataResponse, 'Paginated Ft Basic Metadata Response'),
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? 20;
      const offset = request.query.offset ?? 0;
      const tokens = await fastify.db.getFungibleTokens({
        page: { limit, offset },
        filters: {
          name: request.query.name,
          symbol: request.query.symbol,
          address: request.query.address,
          valid_metadata_only: request.query.valid_metadata_only,
        },
        order: {
          order_by: request.query.order_by ?? FtOrderBy.name,
          order: request.query.order ?? Order.asc,
        },
      });
      await reply.send({
        limit,
        offset,
        total: tokens.total,
        results: tokens.results.map(t => ({
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          total_supply: t.total_supply,
          token_uri: t.uri,
          description: t.description,
          tx_id: t.tx_id,
          sender_address: t.principal?.split('.')[0],
          asset_identifier: `${t.principal}::${t.fungible_token_name}`,
          image_uri: t.cached_image,
          image_canonical_uri: t.image,
          image_thumbnail_uri: t.cached_thumbnail_image,
          contract_principal: t.principal,
        })),
      });
    }
  );
  done();
};

const ShowRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _options,
  done
) => {
  fastify.addHook('preHandler', handleTokenCache);
  fastify.get(
    '/ft/:principal',
    {
      schema: {
        operationId: 'getFtMetadata',
        summary: 'Fungible Token Metadata',
        description: 'Retrieves metadata for a SIP-010 Fungible Token',
        tags: ['Tokens'],
        params: Type.Object({
          principal: FtPrincipalParam,
        }),
        querystring: TokenQuerystringParams,
        response: {
          200: FtMetadataResponse,
          ...TokenErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const metadataBundle = await fastify.db.getTokenMetadataBundle({
          contractPrincipal: request.params.principal,
          tokenNumber: 1,
          locale: request.query.locale,
        });
        const contract = metadataBundle?.smartContract;
        await reply.send({
          name: metadataBundle?.token?.name ?? undefined,
          symbol: metadataBundle?.token?.symbol ?? undefined,
          decimals: metadataBundle?.token?.decimals ?? undefined,
          total_supply: metadataBundle?.token?.total_supply ?? undefined,
          token_uri: metadataBundle?.token?.uri ?? undefined,
          description: metadataBundle?.metadataLocale?.metadata?.description ?? undefined,
          tx_id: contract.tx_id,
          sender_address: contract.principal.split('.')[0],
          asset_identifier: `${contract.principal}::${contract.fungible_token_name}`,
          image_uri: metadataBundle?.metadataLocale?.metadata?.cached_image ?? undefined,
          image_canonical_uri: metadataBundle?.metadataLocale?.metadata?.image ?? undefined,
          image_thumbnail_uri:
            metadataBundle?.metadataLocale?.metadata?.cached_thumbnail_image ?? undefined,
          metadata: parseMetadataLocaleBundle(metadataBundle?.metadataLocale),
        });
      } catch (error) {
        await generateTokenErrorResponse(error, reply);
      }
    }
  );
  done();
};

export const FtRoutes: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async fastify => {
  await fastify.register(IndexRoutes);
  await fastify.register(ShowRoutes);
};
