import { FastifyReply, FastifyRequest } from 'fastify';
import { SmartContractRegEx } from '../schemas';
import { CACHE_CONTROL_MUST_REVALIDATE, parseIfNoneMatchHeader } from '@stacks/api-toolkit';

enum ETagType {
  chainTip = 'chain_tip',
  token = 'token',
}

async function handleCache(type: ETagType, request: FastifyRequest, reply: FastifyReply) {
  const ifNoneMatch = parseIfNoneMatchHeader(request.headers['if-none-match']);
  let etag: string | undefined;
  switch (type) {
    case ETagType.chainTip:
      const chainTip = await request.server.db.core.getChainTip(request.server.db.sql);
      etag = chainTip?.index_block_hash;
      break;
    case ETagType.token:
      etag = await getTokenEtag(request);
      break;
  }
  if (etag) {
    if (ifNoneMatch && ifNoneMatch.includes(etag)) {
      await reply.header('Cache-Control', CACHE_CONTROL_MUST_REVALIDATE).code(304).send();
    } else {
      void reply.headers({ 'Cache-Control': CACHE_CONTROL_MUST_REVALIDATE, ETag: `"${etag}"` });
    }
  }
}

export async function handleTokenCache(request: FastifyRequest, reply: FastifyReply) {
  return handleCache(ETagType.token, request, reply);
}

export async function handleChainTipCache(request: FastifyRequest, reply: FastifyReply) {
  return handleCache(ETagType.chainTip, request, reply);
}

export function setReplyNonCacheable(reply: FastifyReply): void {
  void reply.removeHeader('Cache-Control');
  void reply.removeHeader('Etag');
}

/**
 * Retrieve the token's last modified date as a UNIX epoch so we can use it as the response ETag.
 * @returns Etag string
 */
async function getTokenEtag(request: FastifyRequest): Promise<string | undefined> {
  try {
    const components = request.url.split('/');
    let tokenNumber: bigint = 1n;
    let contractPrincipal: string | undefined;
    do {
      const lastElement = components.pop();
      if (lastElement && lastElement.length) {
        if (SmartContractRegEx.test(lastElement)) {
          contractPrincipal = lastElement;
        } else if (/^\d+$/.test(lastElement)) {
          tokenNumber = BigInt(lastElement);
        }
      }
    } while (components.length);
    if (!contractPrincipal) return;
    return await request.server.db.getTokenEtag({ contractPrincipal, tokenNumber });
  } catch (error) {
    return undefined;
  }
}
