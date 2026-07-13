# Token Metadata API Integration Guide

A comprehensive guide for integrating with the Hiro Token Metadata API to fetch NFT and FT metadata on Stacks.

## Table of Contents

1. [Overview](#overview)
2. [Fetching NFT Metadata](#fetching-nft-metadata)
3. [Fetching FT Metadata](#fetching-ft-metadata)
4. [Building an NFT Gallery](#building-an-nft-gallery)
5. [Caching Strategies](#caching-strategies)
6. [Error Handling](#error-handling)

## Overview

The Token Metadata API provides standardized access to token metadata for both Non-Fungible Tokens (NFTs) and Fungible Tokens (FTs) on the Stacks blockchain.

### Base Configuration

```typescript
const TOKEN_API_BASE = 'https://api.hiro.so/metadata/v1';

interface TokenMetadataClient {
  baseUrl: string;
  apiKey?: string;
}

async function fetchMetadata<T>(
  client: TokenMetadataClient,
  endpoint: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };

  if (client.apiKey) {
    headers['X-API-Key'] = client.apiKey;
  }

  const response = await fetch(`${client.baseUrl}${endpoint}`, { headers });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

const client: TokenMetadataClient = {
  baseUrl: TOKEN_API_BASE
};
```

## Fetching NFT Metadata

### Get NFT Metadata by Token ID

```typescript
interface NFTMetadata {
  token_uri: string;
  metadata: {
    name?: string;
    description?: string;
    image?: string;
    attributes?: Array<{
      trait_type: string;
      value: string | number;
      display_type?: string;
    }>;
  } | null;
  cached_image?: string;
  cached_thumbnail_image?: string;
}

async function getNFTMetadata(
  contractPrincipal: string,
  tokenId: number
): Promise<NFTMetadata> {
  return fetchMetadata<NFTMetadata>(
    client,
    `/nft/${contractPrincipal}/${tokenId}`
  );
}

// Example usage
const nft = await getNFTMetadata(
  'SP2BE8TZATXEVPGZ8HAFZYE5GKZ02X0YDKAN7ZTGW.creature-army',
  42
);

console.log(`Name: ${nft.metadata?.name}`);
console.log(`Image: ${nft.cached_image || nft.metadata?.image}`);
```

### List all NFTs in a Collection

```typescript
interface NFTCollectionResponse {
  limit: number;
  offset: number;
  total: number;
  results: Array<{
    token_id: number;
    metadata: NFTMetadata;
  }>;
}

async function getNFTCollection(
  contractPrincipal: string,
  options: { offset?: number; limit?: number } = {}
): Promise<NFTCollectionResponse> {
  const params = new URLSearchParams();
  if (options.offset) params.set('offset', String(options.offset));
  if (options.limit) params.set('limit', String(options.limit));

  const queryString = params.toString();
  const endpoint = `/nft/${contractPrincipal}${queryString ? `?${queryString}` : ''}`;

  return fetchMetadata<NFTCollectionResponse>(client, endpoint);
}

// Fetch first 50 NFTs in a collection
const collection = await getNFTCollection(
  'SP2BE8TZATXEVPGZ8HAFZYE5GKZ02X0YDKAN7ZTGW.creature-army',
  { limit: 50 }
);

console.log(`Total NFTs: ${collection.total}`);
```

### Get NFTs Owned by Address

```typescript
interface OwnedNFT {
  asset_identifier: string;
  value: {
    hex: string;
    repr: string;
  };
  metadata?: NFTMetadata;
}

async function getOwnedNFTs(
  address: string
): Promise<{ results: OwnedNFT[] }> {
  // Use the Stacks API for ownership, then enhance with metadata
  const stacksApi = 'https://api.mainnet.hiro.so/extended/v1';
  const response = await fetch(
    `${stacksApi}/tokens/nft/holdings?principal=${address}&limit=200`
  );
  const data = await response.json();

  // Enhance with metadata
  const enhanced = await Promise.all(
    data.results.map(async (nft: any) => {
      try {
        const [contract, tokenId] = parseAssetIdentifier(nft.asset_identifier, nft.value.repr);
        const metadata = await getNFTMetadata(contract, parseInt(tokenId));
        return { ...nft, metadata };
      } catch {
        return nft;
      }
    })
  );

  return { results: enhanced };
}

function parseAssetIdentifier(assetId: string, tokenIdRepr: string): [string, string] {
  const contract = assetId.split('::')[0];
  const tokenId = tokenIdRepr.replace('u', '');
  return [contract, tokenId];
}
```

## Fetching FT Metadata

### Get Fungible Token Metadata

```typescript
interface FTMetadata {
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
  token_uri?: string;
  description?: string;
  image_uri?: string;
  image_canonical_uri?: string;
  cached_image?: string;
}

async function getFTMetadata(contractPrincipal: string): Promise<FTMetadata> {
  return fetchMetadata<FTMetadata>(client, `/ft/${contractPrincipal}`);
}

// Example: Get token info
const tokenInfo = await getFTMetadata(
  'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-apower'
);

console.log(`${tokenInfo.name} (${tokenInfo.symbol})`);
console.log(`Decimals: ${tokenInfo.decimals}`);
console.log(`Total Supply: ${BigInt(tokenInfo.total_supply) / BigInt(10 ** tokenInfo.decimals)}`);
```

### List All Fungible Tokens

```typescript
interface FTListResponse {
  limit: number;
  offset: number;
  total: number;
  results: FTMetadata[];
}

async function listFungibleTokens(
  options: { offset?: number; limit?: number; name?: string } = {}
): Promise<FTListResponse> {
  const params = new URLSearchParams();
  if (options.offset) params.set('offset', String(options.offset));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.name) params.set('name', options.name);

  const queryString = params.toString();
  return fetchMetadata<FTListResponse>(
    client,
    `/ft${queryString ? `?${queryString}` : ''}`
  );
}
```

## Building an NFT Gallery

### Complete Gallery Component

```typescript
interface GalleryItem {
  contractId: string;
  tokenId: number;
  name: string;
  description?: string;
  imageUrl: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
}

class NFTGallery {
  private cache = new Map<string, GalleryItem>();

  async loadCollection(
    contractPrincipal: string,
    options: { page?: number; pageSize?: number } = {}
  ): Promise<{ items: GalleryItem[]; total: number; hasMore: boolean }> {
    const pageSize = options.pageSize || 20;
    const offset = (options.page || 0) * pageSize;

    const collection = await getNFTCollection(contractPrincipal, {
      offset,
      limit: pageSize
    });

    const items = collection.results.map(result => 
      this.transformToGalleryItem(contractPrincipal, result)
    );

    return {
      items,
      total: collection.total,
      hasMore: offset + items.length < collection.total
    };
  }

  private transformToGalleryItem(
    contractPrincipal: string,
    result: { token_id: number; metadata: NFTMetadata }
  ): GalleryItem {
    const cacheKey = `${contractPrincipal}:${result.token_id}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const item: GalleryItem = {
      contractId: contractPrincipal,
      tokenId: result.token_id,
      name: result.metadata.metadata?.name || `Token #${result.token_id}`,
      description: result.metadata.metadata?.description,
      imageUrl: this.resolveImageUrl(result.metadata),
      attributes: result.metadata.metadata?.attributes || []
    };

    this.cache.set(cacheKey, item);
    return item;
  }

  private resolveImageUrl(metadata: NFTMetadata): string {
    // Prefer cached images for faster loading
    if (metadata.cached_thumbnail_image) {
      return metadata.cached_thumbnail_image;
    }
    if (metadata.cached_image) {
      return metadata.cached_image;
    }
    if (metadata.metadata?.image) {
      return this.resolveIPFS(metadata.metadata.image);
    }
    return '/placeholder-nft.png';
  }

  private resolveIPFS(uri: string): string {
    if (uri.startsWith('ipfs://')) {
      return `https://ipfs.io/ipfs/${uri.slice(7)}`;
    }
    return uri;
  }
}

// Usage
const gallery = new NFTGallery();
const { items, total, hasMore } = await gallery.loadCollection(
  'SP2BE8TZATXEVPGZ8HAFZYE5GKZ02X0YDKAN7ZTGW.creature-army'
);

items.forEach(item => {
  console.log(`${item.name}: ${item.imageUrl}`);
});
```

## Caching Strategies

### Implement Local Storage Cache

```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class MetadataCache {
  private prefix = 'token-metadata:';
  private defaultTTL = 3600000; // 1 hour

  get<T>(key: string): T | null {
    try {
      const stored = localStorage.getItem(this.prefix + key);
      if (!stored) return null;

      const entry: CacheEntry<T> = JSON.parse(stored);
      
      if (Date.now() - entry.timestamp > entry.ttl) {
        localStorage.removeItem(this.prefix + key);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  set<T>(key: string, data: T, ttl = this.defaultTTL): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl
    };
    
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(entry));
    } catch (e) {
      // Handle quota exceeded
      this.evictOldest();
      localStorage.setItem(this.prefix + key, JSON.stringify(entry));
    }
  }

  private evictOldest(): void {
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(this.prefix));
    
    if (keys.length === 0) return;

    let oldestKey = keys[0];
    let oldestTime = Infinity;

    keys.forEach(key => {
      try {
        const entry = JSON.parse(localStorage.getItem(key)!);
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      } catch {}
    });

    localStorage.removeItem(oldestKey);
  }
}

// Usage with caching
const metadataCache = new MetadataCache();

async function getCachedNFTMetadata(
  contractPrincipal: string,
  tokenId: number
): Promise<NFTMetadata> {
  const cacheKey = `nft:${contractPrincipal}:${tokenId}`;
  
  const cached = metadataCache.get<NFTMetadata>(cacheKey);
  if (cached) return cached;

  const metadata = await getNFTMetadata(contractPrincipal, tokenId);
  metadataCache.set(cacheKey, metadata);
  
  return metadata;
}
```

## Error Handling

### Robust Error Handling Pattern

```typescript
class TokenMetadataError extends Error {
  constructor(
    public code: string,
    message: string,
    public contractPrincipal?: string,
    public tokenId?: number
  ) {
    super(message);
    this.name = 'TokenMetadataError';
  }
}

async function safeGetNFTMetadata(
  contractPrincipal: string,
  tokenId: number
): Promise<NFTMetadata | null> {
  try {
    return await getNFTMetadata(contractPrincipal, tokenId);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('404')) {
        console.warn(`NFT not found: ${contractPrincipal}#${tokenId}`);
        return null;
      }
      if (error.message.includes('429')) {
        // Rate limited, wait and retry
        await new Promise(r => setTimeout(r, 1000));
        return safeGetNFTMetadata(contractPrincipal, tokenId);
      }
    }
    throw new TokenMetadataError(
      'FETCH_FAILED',
      'Failed to fetch NFT metadata',
      contractPrincipal,
      tokenId
    );
  }
}
```

## Additional Resources

- [Token Metadata API Reference](https://docs.hiro.so/token-metadata-api)
- [Stacks.js NFT Operations](https://stacks.js.org/)
- [SIP-009 NFT Standard](https://github.com/stacksgov/sips/blob/main/sips/sip-009/sip-009-nft-standard.md)
- [SIP-010 FT Standard](https://github.com/stacksgov/sips/blob/main/sips/sip-010/sip-010-fungible-token-standard.md)

---

*This guide is maintained by the community. Contributions welcome!*
