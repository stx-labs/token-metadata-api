import { SwaggerOptions } from '@fastify/swagger';
import { Static, TSchema, Type } from '@sinclair/typebox';
import { isProdEnv, logger, SERVER_VERSION } from '@stacks/api-toolkit';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const Nullable = <T extends TSchema>(type: T) => Type.Union([type, Type.Null()]);

const openApiVersion = (() => {
  if (isProdEnv) return SERVER_VERSION.tag;
  try {
    const packageJsonPath = resolve(__dirname, '../../package.json');
    return (JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string }).version;
  } catch (error) {
    logger.error(error, 'Error reading version from package.json');
    return SERVER_VERSION.tag;
  }
})();

export const OpenApiSchemaOptions: SwaggerOptions = {
  openapi: {
    info: {
      title: 'Token Metadata API',
      description:
        'Welcome to the API reference overview for the [Token Metadata API](https://docs.hiro.so/token-metadata-api). Service that indexes metadata for every SIP-009, SIP-010, and SIP-013 Token in the Stacks blockchain and exposes it via REST API endpoints.',
      version: openApiVersion,
    },
    externalDocs: {
      url: 'https://github.com/hirosystems/token-metadata-api',
      description: 'Source Repository',
    },
    servers: [
      {
        url: 'https://api.hiro.so/',
        description: 'mainnet',
      },
      {
        url: 'https://api.testnet.hiro.so/',
        description: 'testnet',
      },
    ],
    tags: [
      {
        name: 'Tokens',
        description: 'Token metadata endpoints',
      },
      {
        name: 'Status',
        description: 'Service status endpoints',
      },
    ],
  },
};

// ==========================
// Parameters
// ==========================

export const SmartContractRegEx =
  /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{28,41}\.[a-zA-Z]([a-zA-Z0-9]|[-_]){0,39}$/;

export const TokenQuerystringParams = Type.Object({
  locale: Type.Optional(
    Type.String({
      title: 'Localization',
      description: 'Metadata localization to retrieve',
      examples: ['es-MX', 'jp'],
    })
  ),
});

export const FtPrincipalParam = Type.String({
  pattern: SmartContractRegEx.source,
  title: 'Fungible Token Contract Principal',
  description: 'Principal for the contract which owns the SIP-010 token',
  examples: ['SP32XCD69XPS3GKDEXAQ29PJRDSD5AR643GNEEBXZ.fari-token'],
});

export const NftPrincipalParam = Type.String({
  pattern: SmartContractRegEx.source,
  title: 'Non-Fungible Token Contract Principal',
  description: 'SIP-009 compliant smart contract principal',
  examples: ['SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12'],
});

export const SftPrincipalParam = Type.String({
  pattern: SmartContractRegEx.source,
  title: 'Semi-Fungible Token Contract Principal',
  description: 'SIP-013 compliant smart contract principal',
  examples: ['SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1'],
});

export const StacksAddressParam = Type.String({
  pattern: '^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{28,41}',
  title: 'Stacks Address',
  description: 'Stacks Address',
  examples: ['SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9'],
});

export const TokenIdParam = Type.Integer({
  title: 'Token ID',
  description: 'Token ID to retrieve',
  examples: ['35'],
});

export const OffsetParam = Type.Integer({
  minimum: 0,
  title: 'Offset',
  description: 'Result offset',
});

export const LimitParam = Type.Integer({
  minimum: 1,
  maximum: 60,
  title: 'Limit',
  description: 'Results per page',
});

export enum FtOrderBy {
  name = 'name',
  symbol = 'symbol',
}
export const FtOrderByParam = Type.Enum(FtOrderBy, {
  title: 'Order By',
  description: 'Parameter to order results by',
});

export enum Order {
  asc = 'asc',
  desc = 'desc',
}
export const OrderParam = Type.Enum(Order, {
  title: 'Order',
  description: 'Results order',
});

// ==========================
// Responses
// ==========================

const MetadataValue = Type.Any({ title: 'Metadata Value', examples: ['value'] });
export type MetadataValueType = Static<typeof MetadataValue>;

export const MetadataAttribute = Type.Object(
  {
    trait_type: Type.String({ examples: ['Background'] }),
    display_type: Type.Optional(Type.String({ examples: ['string'] })),
    value: MetadataValue,
  },
  { title: 'Metadata Attribute' }
);

export const MetadataProperties = Type.Record(Type.String(), MetadataValue, {
  title: 'Metadata Properties',
  examples: [
    {
      collection: 'Foo Collection',
      total_supply: '10000',
    },
  ],
});
export type MetadataPropertiesType = Static<typeof MetadataProperties>;

export const MetadataLocalization = Type.Object(
  {
    uri: Type.String({ format: 'uri', examples: ['http://token.com/metadata?hl={locale}'] }),
    default: Type.String({ examples: ['en'] }),
    locales: Type.Array(Type.String(), { examples: [['en', 'jp']] }),
  },
  { title: 'Metadata Localization' }
);

const TokenDescription = Type.String({
  examples: [
    'Heavy hitters, all-stars and legends of the game join forces to create a collection of unique varsity jackets',
  ],
  description: 'Description',
});

const TokenImage = Type.String({
  format: 'uri',
  examples: ['ipfs://ipfs/QmZMqhh2ztwuZ3Y8PyEp2z5auyH3TCm3nnr5ZfjjgDjd5q/12199.png'],
  description: 'Original image URL',
});

const TokenCachedImage = Type.String({
  format: 'uri',
  examples: ['https://ipfs.io/ipfs/QmZMqhh2ztwuZ3Y8PyEp2z5auyH3TCm3nnr5ZfjjgDjd5q/12199.png'],
  description: 'Cached image URL',
});

export const Metadata = Type.Object(
  {
    sip: Type.Integer({ examples: [16] }),
    name: Type.Optional(Type.String({ examples: ["Satoshi's Team #12200"] })),
    description: Type.Optional(TokenDescription),
    image: Type.Optional(TokenImage),
    cached_image: Type.Optional(TokenCachedImage),
    cached_thumbnail_image: Type.Optional(TokenCachedImage),
    attributes: Type.Optional(Type.Array(MetadataAttribute)),
    properties: Type.Optional(MetadataProperties),
    localization: Type.Optional(MetadataLocalization),
  },
  { title: 'Metadata' }
);
export type MetadataType = Static<typeof Metadata>;

export const TokenUri = Type.String({
  format: 'uri',
  examples: ['ipfs://ipfs/Qmf9yDYuPTrp8NRUFf8xxDd5Ud24Dx9uYMwMn8o8G2cWPW/12200.json'],
  description: "URI for this token's metadata JSON",
});

export const TokenNotFoundResponse = Type.Object(
  {
    error: Type.Literal('Token not found'),
  },
  { title: 'Token Not Found Response' }
);

export const ContractNotFoundResponse = Type.Object(
  {
    error: Type.Literal('Contract not found'),
  },
  { title: 'Contract Not Found Response' }
);

export const TokenNotProcessedResponse = Type.Object(
  {
    error: Type.Literal('Token metadata fetch in progress'),
  },
  { title: 'Token Metadata Fetch In Progress Response' }
);

export const TokenLocaleNotFoundResponse = Type.Object(
  {
    error: Type.Literal('Locale not found'),
  },
  { title: 'Locale Not Found Response' }
);

export const NotFoundResponse = Type.Union([TokenNotFoundResponse, ContractNotFoundResponse], {
  title: 'Not Found Error Response',
});

export const ErrorResponse = Type.Union(
  [
    TokenNotProcessedResponse,
    TokenLocaleNotFoundResponse,
    Type.Object({ error: Type.Literal('Token error'), message: Type.String() }),
  ],
  {
    title: 'Error Response',
  }
);

export const PaginatedResponse = <T extends TSchema>(type: T, title: string) =>
  Type.Object(
    {
      limit: Type.Integer({ examples: [20] }),
      offset: Type.Integer({ examples: [0] }),
      total: Type.Integer({ examples: [1] }),
      results: Type.Array(type),
    },
    { title }
  );

export const FtMetadataResponse = Type.Object(
  {
    name: Type.Optional(Type.String({ examples: ['Wrapped USD'], description: 'Token name' })),
    symbol: Type.Optional(Type.String({ examples: ['xUSD'], description: 'Token symbol' })),
    decimals: Type.Optional(
      Type.Integer({
        examples: [8],
        description: "Number of decimal places clients should use to format this token's amounts",
      })
    ),
    total_supply: Type.Optional(
      Type.String({
        examples: ['9999980000000'],
        description:
          'Current circulating supply as reported by its contract. Clients should format this amount with the correct number of `decimals` before displaying to users',
      })
    ),
    token_uri: Type.Optional(TokenUri),
    description: Type.Optional(TokenDescription),
    image_uri: Type.Optional(TokenCachedImage),
    image_thumbnail_uri: Type.Optional(TokenCachedImage),
    image_canonical_uri: Type.Optional(TokenImage),
    tx_id: Type.String({
      examples: ['0x5642ca7d68976b6b2a2055689d9a57de26d67f0dd8b016d1b0d94cb634454cdd'],
      description: 'ID for the transaction that deployed this token',
    }),
    sender_address: Type.String({
      examples: ['SPZA22A4D15RKH5G8XDGQ7BPC20Q5JNMH0VQKSR6'],
      description: 'Deployer address',
    }),
    asset_identifier: Type.String({
      examples: ['SPZA22A4D15RKH5G8XDGQ7BPC20Q5JNMH0VQKSR6.token-ststx-earn-v1::stSTXearn'],
      description: 'Clarity asset identifier',
    }),
    metadata: Type.Optional(Metadata),
  },
  { title: 'Ft Metadata Response' }
);

export const FtBasicMetadataResponse = Type.Object(
  {
    name: Type.Optional(Type.String({ examples: ['Wrapped USD'] })),
    symbol: Type.Optional(Type.String({ examples: ['xUSD'] })),
    decimals: Type.Optional(Type.Integer({ examples: [8] })),
    total_supply: Type.Optional(Type.String({ examples: ['9999980000000'] })),
    token_uri: Type.Optional(TokenUri),
    description: Type.Optional(TokenDescription),
    image_uri: Type.Optional(TokenCachedImage),
    image_thumbnail_uri: Type.Optional(TokenCachedImage),
    image_canonical_uri: Type.Optional(TokenImage),
    tx_id: Type.String({
      examples: ['0xef2ac1126e16f46843228b1dk4830e19eb7599129e4jf392cab9e65ae83a45c0'],
    }),
    sender_address: Type.String({ examples: ['ST399W7Z9WS0GMSNQGJGME5JAENKN56D65VGMGKGA'] }),
    asset_identifier: Type.String({
      examples: ['SPZA22A4D15RKH5G8XDGQ7BPC20Q5JNMH0VQKSR6.token-ststx-earn-v1::stSTXearn'],
      description: 'Clarity asset identifier',
    }),
    contract_principal: Type.String({
      examples: ['SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2'],
    }),
  },
  { title: 'Ft Basic Metadata Response' }
);

export const NftMetadataResponse = Type.Object(
  {
    token_uri: Type.Optional(TokenUri),
    metadata: Type.Optional(Metadata),
  },
  { title: 'Nft Metadata Response' }
);

export const SftMetadataResponse = Type.Object(
  {
    token_uri: Type.Optional(TokenUri),
    decimals: Type.Optional(Type.Integer({ examples: [6] })),
    total_supply: Type.Optional(Type.String({ examples: ['250'] })),
    metadata: Type.Optional(Metadata),
  },
  { title: 'Sft Metadata Response' }
);

const SearchContractRegEx =
  /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{28,41}\.[a-zA-Z]([a-zA-Z0-9]|[-_]){0,39}(:\d+)?$/;

export const SearchContractParam = Type.Array(
  Type.String({
    pattern: SearchContractRegEx.source,
    title: 'Contract Identifier',
    description: 'Format: PRINCIPAL or PRINCIPAL:TOKEN_NUMBER',
    examples: [
      'SP32XCD69XPS3GKDEXAQ29PJRDSD5AR643GNEEBXZ.fari-token',
      'SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12:120',
    ],
  }),
  {
    minItems: 1,
    maxItems: 50,
    title: 'Contract Identifiers',
    description:
      'Contract identifiers to search for. Format: PRINCIPAL or PRINCIPAL:TOKEN_NUMBER. Defaults token_number to 1 when omitted.',
  }
);

export const SearchQuerystringParams = Type.Object({
  contract: SearchContractParam,
  locale: Type.Optional(
    Type.String({
      title: 'Localization',
      description: 'Metadata localization to retrieve',
      examples: ['es-MX', 'jp'],
    })
  ),
});

export const SearchResultItem = Type.Object(
  {
    contract_id: Type.String({
      examples: ['SP32XCD69XPS3GKDEXAQ29PJRDSD5AR643GNEEBXZ.fari-token'],
      description: 'Contract principal',
    }),
    token_number: Type.Integer({ examples: [1], description: 'Token number' }),
    token_type: Type.String({ examples: ['ft'], description: 'Token type (ft, nft, sft)' }),
    name: Type.Optional(Type.String({ examples: ['Wrapped USD'] })),
    symbol: Type.Optional(Type.String({ examples: ['xUSD'] })),
    decimals: Type.Optional(Type.Integer({ examples: [8] })),
    total_supply: Type.Optional(Type.String({ examples: ['9999980000000'] })),
    token_uri: Type.Optional(TokenUri),
    description: Type.Optional(TokenDescription),
    image_uri: Type.Optional(TokenCachedImage),
    image_thumbnail_uri: Type.Optional(TokenCachedImage),
    image_canonical_uri: Type.Optional(TokenImage),
    tx_id: Type.String({
      examples: ['0x5642ca7d68976b6b2a2055689d9a57de26d67f0dd8b016d1b0d94cb634454cdd'],
      description: 'Transaction ID of the contract deployment',
    }),
    sender_address: Type.String({
      examples: ['SPZA22A4D15RKH5G8XDGQ7BPC20Q5JNMH0VQKSR6'],
      description: 'Deployer address',
    }),
  },
  { title: 'Search Result Item' }
);

export const SearchResponse = Type.Array(SearchResultItem, {
  title: 'Search Response',
});

export const ApiStatusResponse = Type.Object(
  {
    server_version: Type.String({ examples: ['token-metadata-api v0.0.1 (master:a1b2c3)'] }),
    status: Type.String({ examples: ['ready'] }),
    chain_tip: Nullable(
      Type.Object({
        block_height: Type.Integer({ examples: [163541] }),
        index_block_hash: Type.String({
          examples: ['0x1234567890abcdef1234567890abcdef1234567890abcdef'],
        }),
      })
    ),
  },
  { title: 'Api Status Response' }
);
