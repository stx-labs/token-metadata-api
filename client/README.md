## @stacks/token-metadata-api-client

This is a client library for the [Token Metadata API](https://github.com/hirosystems/token-metadata-api).

### Installation

```
npm install @stacks/token-metadata-api-client
```

### Example

```typescript
import { createClient } from '@stacks/token-metadata-api-client';

const client = createClient({ baseUrl: 'https://api.mainnet.hiro.so' });
const metadata = await client.GET('/metadata/v1/ft/{principal}', {
  params: {
    path: {
      principal: 'SM26AQGZBMDPN2NTH0DJWFESFV0NJC744F1GQVZ6Y.token-btc',
    },
  },
});
```
