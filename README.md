
       /     /   ▶ Token Metadata API   
      / --- /      Indexes metadata for all Fungible, Non-Fungible, and Semi-Fungible Tokens in the
     /     /       Stacks blockchain and exposes it via JSON REST API endpoints.

* [Features](#features)
* [API reference](#api-reference)
* [Client library](#client-library)
* [Quick start](#quick-start)
    * [System requirements](#system-requirements)
    * [Running the service](#running-the-service)
        * [Run modes](#run-modes)
    * [Stopping the service](#stopping-the-service)
    * [Using an image cache service](#using-an-image-cache-service)
* [Service architecture](#service-architecture)
    * [Job Queue](#job-queue)
        * [Process Smart Contract Job](#process-smart-contract-job)
        * [Process Token Job](#process-token-job)
* [Bugs and Feature Requests](#bugs-and-feature-requests)
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
* Automatic metadata refreshes via [SIP-019](https://github.com/stacksgov/sips/pull/72)
  notifications
* Metadata localization support
* Metadata fetching via `http:`, `https:`, `data:` URIs. Also supported via customizable gateways:
    * IPFS
    * Arweave
* Easy to use REST JSON endpoints with ETag caching
* Prometheus metrics for job queue status, contract and token counts, API performance, etc.
* Image cache/CDN support
* Run modes for auto-scaling

## API reference

See the [Token Metadata API Reference](https://docs.hiro.so/metadata/) for more information.

## Client library

A TypeScript client library is available for consuming the API. See [the official
package](https://www.npmjs.com/package/@hirosystems/token-metadata-api-client) for more information.

## Quick start

### System requirements

The Token Metadata Service is a microservice that has hard dependencies on other Stacks blockchain
components. Before you start, you'll need to have access to:

1. A fully synchronized [Stacks node](https://github.com/stacks-network/stacks-blockchain)
1. A fully synchronized instance of [Chainhook](https://github.com/hirosystems/chainhook)
1. A local writeable Postgres database for token metadata storage
1. (Optional) A Google Cloud Storage bucket for storing token images

### Running the service

Clone the repo.

Create an `.env` file and specify the appropriate values to configure access to the Stacks API
database, the Token Metadata Service local database, and the Stacks node RPC interface. See
[`env.ts`](https://github.com/hirosystems/token-metadata-api/blob/develop/src/env.ts) for all
available configuration options.

Build the app (NodeJS v22+ is required)
```
npm install
npm run build
```

Start the service
```
npm run start
```

#### Run modes

To better support auto-scaling server configurations, this service supports three run modes
specified by the `RUN_MODE` environment variable:

* `default`: Runs all background jobs and the API server. Use this when you're running this service
  only on one instance. This is the default mode.
* `readonly`: Runs only the API server. Use this in an auto-scaled cluster when you have multiple
  `readonly` instances and just one `writeonly` instance. This mode needs a `writeonly` instance to
  continue populating the token metadata DB.
* `writeonly`: Use one of these in an auto-scaled environment so you can continue consuming new
  token contracts. Use in conjunction with multiple `readonly` instances as explained above.

### Stopping the service

When shutting down, you should always prefer to send the `SIGINT` signal instead of `SIGKILL` so
the service has time to finish any pending background work and all dependencies are gracefully
disconnected.

### Using an image cache service

The Token Metadata API allows you to specify a Google Cloud Storage bucket to store the token images
scanned by the metadata processor. This is recommended if you're looking to optimize your image speeds
when using the API via a wallet, etc. See the `env.ts` file for more information on which environment
variables you need to provide.

## Service architecture

### Job Queue

The role of the
[`JobQueue`](https://github.com/hirosystems/token-metadata-api/blob/develop/src/token-processor/queue/job-queue.ts)
is to perform all the smart contract and token processing in the service.

It is a priority queue that organizes all necessary work for contract ingestion and token metadata
processing. Every job processed by this queue corresponds to one row in the `jobs` DB table, which
marks its processing status and related objects to be worked on (smart contract or token).

This object essentially runs an infinite loop that follows these steps:
1. Upon `start()`, it fetches a set number of job rows that are `'pending'` and loads their
   corresponding `Job` objects into memory for processing, marking those rows now as `'queued'`.
2. It executes each loaded job to completion concurrently. Depending on success or failure, the job
   row is marked as either `'done'` or `'failed'`.
3. Once all loaded jobs are done (and the queue is now empty), it goes back to step 1.

There are two env vars that can help you tune how the queue performs:
* `ENV.JOB_QUEUE_SIZE_LIMIT`: The in-memory size of the queue, i.e. the number of pending jobs that
   are loaded from the database while they wait for execution (see step 1 above).
* `ENV.JOB_QUEUE_CONCURRENCY_LIMIT`: The number of jobs that will be ran simultaneously.

This queue runs continuously and can handle an unlimited number of jobs.

#### Process Smart Contract Job

This job makes a contract call to the Stacks node in order to determine the total number of tokens
declared by the given contract. Once determined, it creates and enqueues all of these tokens for
metadata ingestion.

#### Process Token Job

This job fetches the metadata JSON object for a single token as well as other relevant properties
depending on the token type (symbol, decimals, etc.). Once fetched, it parses and ingests this data
to save it into the local database for API endpoints to return.

If a `429` (Too Many Requests) status code is returned by a hostname used to fetch metadata, the
service will cease all further requests to it until a reasonable amount of time has passed or until
the time specified by the host in a `Retry-After` response header.

## Bugs and feature requests

If you encounter a bug or have a feature request, we encourage you to follow the steps below:

 1. **Search for existing issues:** Before submitting a new issue, please search [existing and closed issues](../../issues) to check if a similar problem or feature request has already been reported.
 1. **Open a new issue:** If it hasn't been addressed, please [open a new issue](../../issues/new/choose). Choose the appropriate issue template and provide as much detail as possible, including steps to reproduce the bug or a clear description of the requested feature.
 1. **Evaluation SLA:** Our team reads and evaluates all the issues and pull requests. We are avaliable Monday to Friday and we make a best effort to respond within 7 business days.

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

- [Visit hiro.so](https://www.hiro.so/) for updates and subcribing to the mailing list.

- Follow [Hiro on Twitter.](https://twitter.com/hirosystems)
