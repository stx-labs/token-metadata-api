# Token Metadata API

A microservice that indexes metadata for all Fungible, Non-Fungible, and Semi-Fungible Tokens on
the Stacks blockchain and exposes it via JSON REST API endpoints. It connects directly to a Stacks
node via the [Stacks Node Publisher](https://github.com/stacks-network/stacks-core) (SNP) Redis
event stream, processing every new block to discover token contracts, track mints and burns, and
fetch off-chain metadata.

* [Features](#features)
* [API reference](#api-reference)
* [Client library](#client-library)
* [Quick start](#quick-start)
    * [System requirements](#system-requirements)
    * [Running the service](#running-the-service)
        * [Run modes](#run-modes)
    * [Stopping the service](#stopping-the-service)
* [Configuration](#configuration)
    * [Core settings](#core-settings)
    * [Stacks node & SNP](#stacks-node--snp)
    * [PostgreSQL](#postgresql)
    * [Job queue](#job-queue)
    * [Metadata fetching](#metadata-fetching)
    * [IPFS & Arweave gateways](#ipfs--arweave-gateways)
    * [Image cache](#image-cache)
* [Bugs and feature requests](#bugs-and-feature-requests)
* [Contribute](#contribute)
* [Community](#community)

## Features

* Complete
  [SIP-016](https://github.com/stacksgov/sips/blob/main/sips/sip-016/sip-016-token-metadata.md)
  metadata ingestion for
    * [SIP-009](https://github.com/stacksgov/sips/blob/main/sips/sip-009/sip-009-nft-standard.md)
      Non-Fungible Tokens
    * [SIP-010](https://github.com/stacksgov/sips/blob/main/sips/sip-010/sip-010-fungible-token-standard.md)
      Fungible Tokens
    * [SIP-013](https://github.com/stacksgov/sips/blob/main/sips/sip-013/sip-013-semi-fungible-token-standard.md)
      Semi-Fungible Tokens
* Real-time block ingestion via the Stacks Node Publisher (SNP) Redis event stream
* Automatic metadata refreshes via
  [SIP-019](https://github.com/stacksgov/sips/pull/72) notifications
* Metadata localization support
* Metadata fetching via `http:`, `https:`, `data:` URIs, plus customizable gateways for IPFS and
  Arweave
* Live tracking of FT/SFT supply through mint and burn event deltas
* Easy to use REST JSON endpoints with ETag caching
* Prometheus metrics for job queue status, contract and token counts, API performance, and more
* Optional image cache/CDN via Google Cloud Storage
* Run modes (`default`, `readonly`, `writeonly`) for auto-scaling deployments
* Admin RPC server for operational tasks (retry failed jobs, refresh metadata, import contracts)

## API reference

See the [Token Metadata API Reference](https://docs.hiro.so/metadata/) for full endpoint
documentation.

## Client library

A fully typed TypeScript client is available for consuming the API. Install it with:

```bash
npm install @stacks/token-metadata-api-client
```

See the [client README](./client/README.md) or the
[npm package](https://www.npmjs.com/package/@stacks/token-metadata-api-client) for usage examples.

## Quick start

### System requirements

| Component | Version / Notes |
|---|---|
| **Node.js** | >= 22 |
| **PostgreSQL** | >= 15 (local, writable) |
| **Stacks node** | Fully synchronized, with the RPC interface accessible |
| **Redis** | Required for the SNP event stream (`SNP_REDIS_URL`) |
| **Google Cloud Storage** | *(Optional)* For token image caching |

### Running the service

Clone the repo:

```bash
git clone https://github.com/hirosystems/token-metadata-api.git
cd token-metadata-api
```

Create an `.env` file and specify the appropriate values. At a minimum you need:

```env
# Stacks node
STACKS_NODE_RPC_HOST=127.0.0.1
STACKS_NODE_RPC_PORT=20443

# SNP event stream (Redis)
SNP_REDIS_URL=redis://127.0.0.1:6379
SNP_REDIS_STREAM_KEY_PREFIX=stacks-node

# PostgreSQL
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=token_metadata
```

See the [Configuration](#configuration) section below for every available option.

Build and start:

```bash
npm install
npm run build
npm run start
```

The API server starts on port `3000` by default, the Admin RPC server on port `3001`, and
Prometheus metrics on port `9153`.

#### Run modes

The `RUN_MODE` environment variable controls which components the service starts. This allows you
to scale the read and write paths independently:

| Mode | Background services | API server | Use case |
|---|---|---|---|
| `default` | Yes (Job queue, SNP stream, Admin RPC) | Yes | Single-instance deployments |
| `readonly` | No | Yes | Horizontally-scaled API replicas |
| `writeonly` | Yes (Job queue, SNP stream, Admin RPC) | No | Dedicated indexing instance |

In an auto-scaled cluster you would typically run **one** `writeonly` instance that ingests data
and **multiple** `readonly` instances behind a load balancer to serve API traffic.

### Stopping the service

Always prefer sending `SIGINT` (Ctrl+C) instead of `SIGKILL`. This allows the service to finish
any in-progress jobs, flush writes, and cleanly disconnect from PostgreSQL and Redis.

## Configuration

All configuration is done via environment variables. Defaults are shown in parentheses.

### Core settings

| Variable | Description | Default |
|---|---|---|
| `RUN_MODE` | `default`, `readonly`, or `writeonly` | `default` |
| `NETWORK` | `mainnet` or `testnet` | `mainnet` |
| `API_HOST` | API server bind address | `0.0.0.0` |
| `API_PORT` | API server port | `3000` |
| `ADMIN_RPC_PORT` | Admin RPC server port | `3001` |
| `PROMETHEUS_PORT` | Prometheus metrics port | `9153` |

### Stacks node & SNP

| Variable | Description | Default |
|---|---|---|
| `STACKS_NODE_RPC_HOST` | Stacks node RPC hostname | *(required)* |
| `STACKS_NODE_RPC_PORT` | Stacks node RPC port | *(required)* |
| `STACKS_API_BASE_URL` | Stacks API base URL (for admin contract imports) | `https://api.mainnet.hiro.so` |
| `SNP_REDIS_URL` | Redis URL for the SNP event stream | *(required)* |
| `SNP_REDIS_STREAM_KEY_PREFIX` | Redis stream key prefix | *(required)* |

### PostgreSQL

| Variable | Description | Default |
|---|---|---|
| `PGHOST` | Database host | *(required)* |
| `PGPORT` | Database port | `5432` |
| `PGUSER` | Database user | *(required)* |
| `PGPASSWORD` | Database password | *(required)* |
| `PGDATABASE` | Database name | *(required)* |
| `PG_CONNECTION_POOL_MAX` | Max connections in pool | `10` |
| `PG_IDLE_TIMEOUT` | Idle connection timeout (seconds) | `30` |
| `PG_MAX_LIFETIME` | Max connection lifetime (seconds) | `60` |
| `PG_CLOSE_TIMEOUT` | Connection close timeout (seconds) | `10` |

### Job queue

| Variable | Description | Default |
|---|---|---|
| `JOB_QUEUE_AUTO_START` | Automatically start the queue on boot | `true` |
| `JOB_QUEUE_STRICT_MODE` | Enable strict processing mode | `false` |
| `JOB_QUEUE_SIZE_LIMIT` | Number of pending jobs loaded into memory per batch | `200` |
| `JOB_QUEUE_CONCURRENCY_LIMIT` | Number of jobs executed simultaneously | `5` |
| `JOB_QUEUE_MAX_RETRIES` | Max retry attempts for a failed job | `10` |
| `JOB_QUEUE_TIMEOUT_MS` | Timeout per job (ms) | `60000` |
| `JOB_QUEUE_RETRY_AFTER_MS` | Delay before retrying a failed job (ms) | `5000` |

### Metadata fetching

| Variable | Description | Default |
|---|---|---|
| `METADATA_FETCH_TIMEOUT_MS` | HTTP timeout for fetching metadata (ms) | `30000` |
| `METADATA_MAX_IMMEDIATE_URI_RETRIES` | Max immediate retries for a metadata URI | `3` |
| `METADATA_MAX_PAYLOAD_BYTE_SIZE` | Max metadata JSON payload size (bytes) | `1000000` |
| `METADATA_MAX_NFT_CONTRACT_TOKEN_COUNT` | Max tokens to index per NFT contract | `50000` |
| `METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL` | Interval for dynamic token refreshes (seconds) | `86400` |
| `METADATA_RATE_LIMITED_HOST_RETRY_AFTER` | Wait time after a 429 response (seconds) | `60` |
| `METADATA_FETCH_MAX_REDIRECTIONS` | Max HTTP redirects to follow | `5` |

### IPFS & Arweave gateways

| Variable | Description | Default |
|---|---|---|
| `PUBLIC_GATEWAY_IPFS` | IPFS gateway URL | `https://cloudflare-ipfs.com` |
| `PUBLIC_GATEWAY_IPFS_EXTRA_HEADER` | Extra header for IPFS gateway requests | *(none)* |
| `PUBLIC_GATEWAY_IPFS_REPLACED` | Comma-separated list of IPFS gateways to replace | *(common gateways)* |
| `PUBLIC_GATEWAY_ARWEAVE` | Arweave gateway URL | `https://arweave.net` |

### Image cache

| Variable | Description | Default |
|---|---|---|
| `IMAGE_CACHE_PROCESSOR_ENABLED` | Enable image caching | `false` |
| `IMAGE_CACHE_RESIZE_WIDTH` | Thumbnail width (px) | `300` |
| `IMAGE_CACHE_GCS_BUCKET_NAME` | Google Cloud Storage bucket name | *(none)* |
| `IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX` | Object name prefix in GCS | *(none)* |
| `IMAGE_CACHE_CDN_BASE_PATH` | CDN base URL for cached images | *(none)* |
| `IMAGE_CACHE_MAX_BYTE_SIZE` | Max image size to cache (bytes) | *(none)* |


## Bugs and feature requests

If you encounter a bug or have a feature request, we encourage you to follow the steps below:

 1. **Search for existing issues:** Before submitting a new issue, please search [existing and closed issues](../../issues) to check if a similar problem or feature request has already been reported.
 1. **Open a new issue:** If it hasn't been addressed, please [open a new issue](../../issues/new/choose). Choose the appropriate issue template and provide as much detail as possible, including steps to reproduce the bug or a clear description of the requested feature.
 1. **Evaluation SLA:** Our team reads and evaluates all the issues and pull requests. We are available Monday to Friday and we make a best effort to respond within 7 business days.

Please **do not** use the issue tracker for personal support requests or to ask for the status of a transaction. You'll find help at the [#support Discord channel](https://discord.gg/SK3DxdsP).


## Contribute

Development of this product happens in the open on GitHub, and we are grateful to the community for contributing bugfixes and improvements. Read below to learn how you can take part in improving the product.

### Code of Conduct
Please read our [Code of conduct](../../../.github/blob/main/CODE_OF_CONDUCT.md) since we expect project participants to adhere to it. 

### Contributing Guide
Read our [contributing guide](.github/CONTRIBUTING.md) to learn about our development process, how to propose bugfixes and improvements, and how to build and test your changes.

## Community

Join our community and stay connected with the latest updates and discussions:

- [Join our Discord community chat](https://discord.gg/ZQR6cyZC) to engage with other users, ask questions, and participate in discussions.

- [Visit hiro.so](https://www.hiro.so/) for updates and subscribing to the mailing list.

- Follow [Hiro on Twitter.](https://twitter.com/hirosystems)
