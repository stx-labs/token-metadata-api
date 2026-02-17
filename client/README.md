## @stacks/token-metadata-api-client

A fully typed TypeScript client for the
[Token Metadata API](https://github.com/hirosystems/token-metadata-api). Built on
[openapi-fetch](https://openapi-ts.dev/openapi-fetch/), it provides autocompletion for every
endpoint path, query parameter, and response type with zero runtime overhead.

### Features

- Full TypeScript autocompletion for paths, parameters, and responses
- Supports SIP-010 Fungible Tokens, SIP-009 Non-Fungible Tokens, and SIP-013 Semi-Fungible Tokens
- Works in Node.js and browsers (UMD bundle included)
- Configurable base URL and fetch implementation

### Installation

```bash
npm install @stacks/token-metadata-api-client
```

### Quick start

```typescript
import { createClient } from '@stacks/token-metadata-api-client';

const client = createClient();
```

By default the client points to `https://api.mainnet.hiro.so`. You can override this (or any other
[`openapi-fetch` client option](https://openapi-ts.dev/openapi-fetch/api#create-client)) when
creating the client:

```typescript
const client = createClient({
  baseUrl: 'http://localhost:3000',
});
```

Every method returns `{ data, error, response }` where `data` is the typed success body and `error`
is the typed error body. The raw `Response` object is also available.

---

### API status

Check if the API is ready and which chain tip it has indexed.

```typescript
const { data, error } = await client.GET('/metadata/v1/');

if (data) {
  console.log(data.server_version); // e.g. "token-metadata-api v0.0.1 (master:a1b2c3)"
  console.log(data.status);         // e.g. "ready"
  console.log(data.chain_tip);      // { block_height: 150000, index_block_hash: "0x..." } | null
}
```

---

### Fungible Tokens (SIP-010)

#### List all fungible tokens

Retrieve a paginated list of all indexed fungible tokens. Supports filtering by `name`, `symbol`,
or deployer `address`, and ordering results.

```typescript
const { data } = await client.GET('/metadata/v1/ft', {
  params: {
    query: {
      limit: 10,
      offset: 0,
      order_by: 'name',
      order: 'asc',
    },
  },
});

if (data) {
  console.log(`Total tokens: ${data.total}`);
  for (const token of data.results) {
    console.log(`${token.symbol} - ${token.name} (${token.contract_principal})`);
  }
}
```

Filter by name or symbol:

```typescript
const { data } = await client.GET('/metadata/v1/ft', {
  params: {
    query: { name: 'Bitcoin' },
  },
});
```

Filter by deployer address:

```typescript
const { data } = await client.GET('/metadata/v1/ft', {
  params: {
    query: { address: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9' },
  },
});
```

Return only tokens with valid SIP-016 metadata:

```typescript
const { data } = await client.GET('/metadata/v1/ft', {
  params: {
    query: { valid_metadata_only: true },
  },
});
```

#### Get metadata for a specific fungible token

```typescript
const { data, error } = await client.GET('/metadata/v1/ft/{principal}', {
  params: {
    path: {
      principal: 'SP32XCD69XPS3GKDEXAQ29PJRDSD5AR643GNEEBXZ.fari-token',
    },
  },
});

if (data) {
  console.log(data.name);         // "Fari Token"
  console.log(data.symbol);       // "FARI"
  console.log(data.decimals);     // 8
  console.log(data.total_supply); // "9999980000000"
  console.log(data.description);
  console.log(data.image_uri);

  // SIP-016 metadata (when available)
  if (data.metadata) {
    console.log(data.metadata.sip);        // 16
    console.log(data.metadata.attributes); // [{ trait_type, value, display_type? }]
    console.log(data.metadata.properties); // { collection: "...", total_supply: "..." }
  }
}
```

Request a specific locale (SIP-016 localization):

```typescript
const { data } = await client.GET('/metadata/v1/ft/{principal}', {
  params: {
    path: { principal: 'SP32XCD69XPS3GKDEXAQ29PJRDSD5AR643GNEEBXZ.fari-token' },
    query: { locale: 'jp' },
  },
});
```

---

### Non-Fungible Tokens (SIP-009)

Retrieve metadata for a specific NFT by its contract principal and token ID.

```typescript
const { data, error } = await client.GET('/metadata/v1/nft/{principal}/{token_id}', {
  params: {
    path: {
      principal: 'SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12',
      token_id: 35,
    },
  },
});

if (data) {
  console.log(data.token_uri);

  if (data.metadata) {
    console.log(data.metadata.name);        // "Boombox #35"
    console.log(data.metadata.description);
    console.log(data.metadata.image);        // Original image URI (e.g. ipfs://...)
    console.log(data.metadata.cached_image); // Cached HTTP URL ready to display

    // Attributes (traits)
    for (const attr of data.metadata.attributes ?? []) {
      console.log(`${attr.trait_type}: ${attr.value}`);
    }

    // Localization info
    if (data.metadata.localization) {
      console.log(data.metadata.localization.default);  // "en"
      console.log(data.metadata.localization.locales);  // ["en", "jp"]
    }
  }
}
```

Request a localized version:

```typescript
const { data } = await client.GET('/metadata/v1/nft/{principal}/{token_id}', {
  params: {
    path: {
      principal: 'SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12',
      token_id: 35,
    },
    query: { locale: 'jp' },
  },
});
```

---

### Semi-Fungible Tokens (SIP-013)

Retrieve metadata for a specific SFT by its contract principal and token ID. The response also
includes `decimals` and `total_supply` for the given token ID.

```typescript
const { data, error } = await client.GET('/metadata/v1/sft/{principal}/{token_id}', {
  params: {
    path: {
      principal: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1',
      token_id: 1,
    },
  },
});

if (data) {
  console.log(data.decimals);     // 6
  console.log(data.total_supply); // "250"
  console.log(data.token_uri);

  if (data.metadata) {
    console.log(data.metadata.name);
    console.log(data.metadata.description);
    console.log(data.metadata.cached_image);
  }
}
```

---

### Error handling

All endpoints return `{ data, error }`. When a request fails, `data` will be `undefined` and
`error` will contain a typed error body. You can also inspect the raw `response` for the HTTP status
code.

```typescript
const { data, error, response } = await client.GET('/metadata/v1/ft/{principal}', {
  params: {
    path: { principal: 'SP000000000000000000000.nonexistent' },
  },
});

if (error) {
  // `error` is typed — possible values depend on the status code
  console.error(`HTTP ${response.status}: ${error.error}`);
  // 404 → "Token not found" | "Contract not found"
  // 422 → "Token metadata fetch in progress" | "Locale not found" | "Token error"
}
```

You can also handle specific status codes:

```typescript
if (response.status === 404) {
  console.log('Token does not exist');
} else if (response.status === 422) {
  console.log('Metadata is still being indexed, try again later');
}
```

---

### Using a custom fetch implementation

You can pass any custom `fetch` function (e.g. for adding auth headers, logging, or using a
different HTTP library):

```typescript
const client = createClient({
  baseUrl: 'https://api.mainnet.hiro.so',
  fetch: async (input, init) => {
    console.log(`→ ${init?.method ?? 'GET'} ${input}`);
    const response = await fetch(input, init);
    console.log(`← ${response.status}`);
    return response;
  },
});
```

### Browser usage

The package ships a UMD bundle at `lib/index.umd.js` that can be loaded via a `<script>` tag or
any UMD-compatible loader:

```html
<script src="https://unpkg.com/@stacks/token-metadata-api-client/lib/index.umd.js"></script>
<script>
  const client = TokenMetadataApiClient.createClient();
  client.GET('/metadata/v1/ft/{principal}', {
    params: { path: { principal: 'SP32XCD69XPS3GKDEXAQ29PJRDSD5AR643GNEEBXZ.fari-token' } },
  }).then(({ data }) => console.log(data));
</script>
```

### TypeScript

All request parameters and response types are inferred automatically from the OpenAPI schema. No
manual type imports are needed — just use the `data` and `error` objects returned by each call and
your editor will provide full autocompletion.

If you need to reference the types directly, you can import the generated schema:

```typescript
import type { operations } from '@stacks/token-metadata-api-client/lib/generated/schema';

type FtMetadataResponse =
  operations['getFtMetadata']['responses']['200']['content']['application/json'];
```
