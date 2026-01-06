## [1.3.2](https://github.com/hirosystems/token-metadata-api/compare/v1.3.1...v1.3.2) (2025-10-02)


### Bug Fixes

* force close db connection after a configurable timeout ([#321](https://github.com/hirosystems/token-metadata-api/issues/321)) ([2b02e81](https://github.com/hirosystems/token-metadata-api/commit/2b02e81095e10584be0649b749af4d15dd43337e))

## [1.3.1](https://github.com/hirosystems/token-metadata-api/compare/v1.3.0...v1.3.1) (2025-10-02)


### Bug Fixes

* replace hard coded IPFS gateways with configurable gateway ([#319](https://github.com/hirosystems/token-metadata-api/issues/319)) ([d04012f](https://github.com/hirosystems/token-metadata-api/commit/d04012f9187a8885bab5046bb626010f681f57fb))

## [1.3.0](https://github.com/hirosystems/token-metadata-api/compare/v1.2.0...v1.3.0) (2025-06-16)


### Features

* add `/import-contract` admin rpc endpoint ([#309](https://github.com/hirosystems/token-metadata-api/issues/309)) ([3aef505](https://github.com/hirosystems/token-metadata-api/commit/3aef5055cdb0afa3b682a23aff124a8ae91960ec))


### Bug Fixes

* update chainhook predicate start_block upon re-registration ([#308](https://github.com/hirosystems/token-metadata-api/issues/308)) ([929f08e](https://github.com/hirosystems/token-metadata-api/commit/929f08e33dedd4b7499799c468483692312d839f))

## [1.3.0-beta.1](https://github.com/hirosystems/token-metadata-api/compare/v1.2.1-beta.1...v1.3.0-beta.1) (2025-06-10)


### Features

* add `/import-contract` admin rpc endpoint ([#309](https://github.com/hirosystems/token-metadata-api/issues/309)) ([3aef505](https://github.com/hirosystems/token-metadata-api/commit/3aef5055cdb0afa3b682a23aff124a8ae91960ec))

## [1.2.1-beta.1](https://github.com/hirosystems/token-metadata-api/compare/v1.2.0...v1.2.1-beta.1) (2025-06-04)


### Bug Fixes

* update chainhook predicate start_block upon re-registration ([#308](https://github.com/hirosystems/token-metadata-api/issues/308)) ([929f08e](https://github.com/hirosystems/token-metadata-api/commit/929f08e33dedd4b7499799c468483692312d839f))

## [1.2.0](https://github.com/hirosystems/token-metadata-api/compare/v1.1.7...v1.2.0) (2025-04-18)


### Features

* show asset_identifier in ft list response, add filter by valid metadata ([#298](https://github.com/hirosystems/token-metadata-api/issues/298)) ([aae897a](https://github.com/hirosystems/token-metadata-api/commit/aae897ad862ed8489f7f36c8083240c1e1677214))


### Bug Fixes

* add db indexes to optimize endpoint queries ([#296](https://github.com/hirosystems/token-metadata-api/issues/296)) ([50c75e6](https://github.com/hirosystems/token-metadata-api/commit/50c75e639c5527d6127692f21d3e72f1c56461c2))

## [1.1.7](https://github.com/hirosystems/token-metadata-api/compare/v1.1.6...v1.1.7) (2025-04-04)


### Bug Fixes

* return fts without sip16 metadata in search results ([#293](https://github.com/hirosystems/token-metadata-api/issues/293)) ([24028ae](https://github.com/hirosystems/token-metadata-api/commit/24028aeba6e7676456351e1e04e6b72668ecc44b))

## [1.1.6](https://github.com/hirosystems/token-metadata-api/compare/v1.1.5...v1.1.6) (2024-12-17)


### Bug Fixes

* display token supply with correct decimals ([#287](https://github.com/hirosystems/token-metadata-api/issues/287)) ([94c7b4a](https://github.com/hirosystems/token-metadata-api/commit/94c7b4a2ae68697e35e87c73d7f7e132bf1afad6))
* roll back FT supply display, update docs instead ([#288](https://github.com/hirosystems/token-metadata-api/issues/288)) ([080176e](https://github.com/hirosystems/token-metadata-api/commit/080176e036bbb85bba82c1d619a69a60d7df21c3)), closes [#287](https://github.com/hirosystems/token-metadata-api/issues/287)
* update ft date on supply change ([#289](https://github.com/hirosystems/token-metadata-api/issues/289)) ([94b9486](https://github.com/hirosystems/token-metadata-api/commit/94b94868a3808324a0f6c23d0e423886dd143fa4))

## [1.1.5](https://github.com/hirosystems/token-metadata-api/compare/v1.1.4...v1.1.5) (2024-12-16)


### Bug Fixes

* allow multiple sft mints for the same token per transaction ([#279](https://github.com/hirosystems/token-metadata-api/issues/279)) ([9b28880](https://github.com/hirosystems/token-metadata-api/commit/9b28880815a75f93f218fae69dc6e7147c908514))
* process nft and sft mints in batches ([#271](https://github.com/hirosystems/token-metadata-api/issues/271)) ([c98f0cd](https://github.com/hirosystems/token-metadata-api/commit/c98f0cd6a1001933764ab2fbb4026f8824127f35))
* upgrade to new chainhook ts client ([#280](https://github.com/hirosystems/token-metadata-api/issues/280)) ([b67dc8c](https://github.com/hirosystems/token-metadata-api/commit/b67dc8cd4e21f91a50a1c0c85880d2f265ab1d51))

## [1.1.5-beta.3](https://github.com/hirosystems/token-metadata-api/compare/v1.1.5-beta.2...v1.1.5-beta.3) (2024-10-22)


### Bug Fixes

* upgrade to new chainhook ts client ([#280](https://github.com/hirosystems/token-metadata-api/issues/280)) ([b67dc8c](https://github.com/hirosystems/token-metadata-api/commit/b67dc8cd4e21f91a50a1c0c85880d2f265ab1d51))

## [1.1.5-beta.2](https://github.com/hirosystems/token-metadata-api/compare/v1.1.5-beta.1...v1.1.5-beta.2) (2024-10-21)


### Bug Fixes

* allow multiple sft mints for the same token per transaction ([#279](https://github.com/hirosystems/token-metadata-api/issues/279)) ([9b28880](https://github.com/hirosystems/token-metadata-api/commit/9b28880815a75f93f218fae69dc6e7147c908514))

## [1.1.5-beta.1](https://github.com/hirosystems/token-metadata-api/compare/v1.1.4...v1.1.5-beta.1) (2024-10-07)


### Bug Fixes

* process nft and sft mints in batches ([#271](https://github.com/hirosystems/token-metadata-api/issues/271)) ([c98f0cd](https://github.com/hirosystems/token-metadata-api/commit/c98f0cd6a1001933764ab2fbb4026f8824127f35))

## [1.1.4](https://github.com/hirosystems/token-metadata-api/compare/v1.1.3...v1.1.4) (2024-09-23)


### Bug Fixes

* treat non-compliant SIP-016 metadata as invalid ([#266](https://github.com/hirosystems/token-metadata-api/issues/266)) ([288723d](https://github.com/hirosystems/token-metadata-api/commit/288723d577d35ecd38c75c26d572a28f548388fc))

## [1.1.3](https://github.com/hirosystems/token-metadata-api/compare/v1.1.2...v1.1.3) (2024-09-23)


### Bug Fixes

* ignore events from failed transactions ([#264](https://github.com/hirosystems/token-metadata-api/issues/264)) ([84252a7](https://github.com/hirosystems/token-metadata-api/commit/84252a7d218de39f5c9379f933af99d49186c9fe))

## [1.1.2](https://github.com/hirosystems/token-metadata-api/compare/v1.1.1...v1.1.2) (2024-08-30)


### Bug Fixes

* handle updated chain tip on rollbacks correctly ([#261](https://github.com/hirosystems/token-metadata-api/issues/261)) ([b85b1d3](https://github.com/hirosystems/token-metadata-api/commit/b85b1d3903a336d5691e05387140fcc1e8a41f16))

## [1.1.1](https://github.com/hirosystems/token-metadata-api/compare/v1.1.0...v1.1.1) (2024-08-30)


### Bug Fixes

* allow boolean metadata properties ([#260](https://github.com/hirosystems/token-metadata-api/issues/260)) ([d52861a](https://github.com/hirosystems/token-metadata-api/commit/d52861a1434d51ffd340063ca2cc5ccc4bb03676))

## [1.1.0](https://github.com/hirosystems/token-metadata-api/compare/v1.0.3...v1.1.0) (2024-08-30)


### Features

* add configurable delay for retrying jobs ([#257](https://github.com/hirosystems/token-metadata-api/issues/257)) ([20d753a](https://github.com/hirosystems/token-metadata-api/commit/20d753a82a4e7f214cf9dc8cb2fee333ac5a4f4c))


### Bug Fixes

* add chain tip etag generator ([#255](https://github.com/hirosystems/token-metadata-api/issues/255)) ([2b993cd](https://github.com/hirosystems/token-metadata-api/commit/2b993cd34484e156db9e24be8571c0e0e5b4bde0))
* retry when a contract is not yet found ([#256](https://github.com/hirosystems/token-metadata-api/issues/256)) ([46d8fc8](https://github.com/hirosystems/token-metadata-api/commit/46d8fc892790d64e2a2646efbc64d97be4a109e3))

## [1.0.3](https://github.com/hirosystems/token-metadata-api/compare/v1.0.2...v1.0.3) (2024-08-27)


### Bug Fixes

* correctly classify image errors vs metadata errors ([#251](https://github.com/hirosystems/token-metadata-api/issues/251)) ([7369554](https://github.com/hirosystems/token-metadata-api/commit/736955451c651f7c5f9d4d985060bfa68dee7b27))

## [1.0.2](https://github.com/hirosystems/token-metadata-api/compare/v1.0.1...v1.0.2) (2024-08-27)


### Bug Fixes

* add block_height to status and prometheus ([#250](https://github.com/hirosystems/token-metadata-api/issues/250)) ([4502c7d](https://github.com/hirosystems/token-metadata-api/commit/4502c7dd2ba8ad6ef3159e0abdad482e73437800))

## [1.0.1](https://github.com/hirosystems/token-metadata-api/compare/v1.0.0...v1.0.1) (2024-08-27)


### Bug Fixes

* demote server connection errors and contract clarity errors to be non-retryable ([#249](https://github.com/hirosystems/token-metadata-api/issues/249)) ([87ad8af](https://github.com/hirosystems/token-metadata-api/commit/87ad8af6e36a139950286da1b37818dc32f30927))

## [1.0.0](https://github.com/hirosystems/token-metadata-api/compare/v0.7.0...v1.0.0) (2024-08-26)


### ⚠ BREAKING CHANGES

* use chainhook to listen for chain events instead of a direct stacks api connection (#200)

### Features

* convert data: image uris into image files and upload to cdn ([#245](https://github.com/hirosystems/token-metadata-api/issues/245)) ([903b0aa](https://github.com/hirosystems/token-metadata-api/commit/903b0aa2a63acc3340fdde570201f5c424f4443c))


### Bug Fixes

* catch econnreset errors ([#247](https://github.com/hirosystems/token-metadata-api/issues/247)) ([51347d6](https://github.com/hirosystems/token-metadata-api/commit/51347d635d4e50f299af07fef8378ae279f14461))
* set maximum job timeout ([#244](https://github.com/hirosystems/token-metadata-api/issues/244)) ([3444917](https://github.com/hirosystems/token-metadata-api/commit/344491770172a8f8a22f4f5d8c485fd98256997c))
* take only first page of gif images ([#241](https://github.com/hirosystems/token-metadata-api/issues/241)) ([334f8c5](https://github.com/hirosystems/token-metadata-api/commit/334f8c524d976719f9d33ed611ddf6a1a8e7bb05))
* use bignumber to handle FT supplies ([#239](https://github.com/hirosystems/token-metadata-api/issues/239)) ([053d622](https://github.com/hirosystems/token-metadata-api/commit/053d622d33bc46401acbe80980010e2407383c1a))
* use google cloud library for image uploads ([#238](https://github.com/hirosystems/token-metadata-api/issues/238)) ([c7f1b43](https://github.com/hirosystems/token-metadata-api/commit/c7f1b4368dbec0e028a4e7676c82c25f0ebaeb09))
* use prometheus port configured in ENV ([c769d29](https://github.com/hirosystems/token-metadata-api/commit/c769d2950d65448265caf2bf6bd78fce437358c0))


### Code Refactoring

* use chainhook to listen for chain events instead of a direct stacks api connection ([#200](https://github.com/hirosystems/token-metadata-api/issues/200)) ([2ddb2c7](https://github.com/hirosystems/token-metadata-api/commit/2ddb2c7db37419538bd4267c863aaf1f8a2ec5c1)), closes [#229](https://github.com/hirosystems/token-metadata-api/issues/229) [#232](https://github.com/hirosystems/token-metadata-api/issues/232) [#233](https://github.com/hirosystems/token-metadata-api/issues/233) [#234](https://github.com/hirosystems/token-metadata-api/issues/234) [#235](https://github.com/hirosystems/token-metadata-api/issues/235) [#236](https://github.com/hirosystems/token-metadata-api/issues/236)

## [1.0.0-beta.7](https://github.com/hirosystems/token-metadata-api/compare/v1.0.0-beta.6...v1.0.0-beta.7) (2024-08-26)


### Bug Fixes

* catch econnreset errors ([#247](https://github.com/hirosystems/token-metadata-api/issues/247)) ([51347d6](https://github.com/hirosystems/token-metadata-api/commit/51347d635d4e50f299af07fef8378ae279f14461))

## [1.0.0-beta.6](https://github.com/hirosystems/token-metadata-api/compare/v1.0.0-beta.5...v1.0.0-beta.6) (2024-08-26)


### Features

* convert data: image uris into image files and upload to cdn ([#245](https://github.com/hirosystems/token-metadata-api/issues/245)) ([903b0aa](https://github.com/hirosystems/token-metadata-api/commit/903b0aa2a63acc3340fdde570201f5c424f4443c))

## [1.0.0-beta.5](https://github.com/hirosystems/token-metadata-api/compare/v1.0.0-beta.4...v1.0.0-beta.5) (2024-08-26)


### Bug Fixes

* set maximum job timeout ([#244](https://github.com/hirosystems/token-metadata-api/issues/244)) ([3444917](https://github.com/hirosystems/token-metadata-api/commit/344491770172a8f8a22f4f5d8c485fd98256997c))

## [1.0.0-beta.4](https://github.com/hirosystems/token-metadata-api/compare/v1.0.0-beta.3...v1.0.0-beta.4) (2024-08-24)


### Bug Fixes

* take only first page of gif images ([#241](https://github.com/hirosystems/token-metadata-api/issues/241)) ([334f8c5](https://github.com/hirosystems/token-metadata-api/commit/334f8c524d976719f9d33ed611ddf6a1a8e7bb05))

## [1.0.0-beta.3](https://github.com/hirosystems/token-metadata-api/compare/v1.0.0-beta.2...v1.0.0-beta.3) (2024-08-22)


### Bug Fixes

* use bignumber to handle FT supplies ([#239](https://github.com/hirosystems/token-metadata-api/issues/239)) ([053d622](https://github.com/hirosystems/token-metadata-api/commit/053d622d33bc46401acbe80980010e2407383c1a))

## [1.0.0-beta.2](https://github.com/hirosystems/token-metadata-api/compare/v1.0.0-beta.1...v1.0.0-beta.2) (2024-08-22)


### Bug Fixes

* use google cloud library for image uploads ([#238](https://github.com/hirosystems/token-metadata-api/issues/238)) ([c7f1b43](https://github.com/hirosystems/token-metadata-api/commit/c7f1b4368dbec0e028a4e7676c82c25f0ebaeb09))

## [1.0.0-beta.1](https://github.com/hirosystems/token-metadata-api/compare/v0.7.0...v1.0.0-beta.1) (2024-08-21)


### ⚠ BREAKING CHANGES

* use chainhook to listen for chain events instead of a direct stacks api connection (#200)

### Bug Fixes

* use prometheus port configured in ENV ([c769d29](https://github.com/hirosystems/token-metadata-api/commit/c769d2950d65448265caf2bf6bd78fce437358c0))


### Code Refactoring

* use chainhook to listen for chain events instead of a direct stacks api connection ([#200](https://github.com/hirosystems/token-metadata-api/issues/200)) ([2ddb2c7](https://github.com/hirosystems/token-metadata-api/commit/2ddb2c7db37419538bd4267c863aaf1f8a2ec5c1)), closes [#229](https://github.com/hirosystems/token-metadata-api/issues/229) [#232](https://github.com/hirosystems/token-metadata-api/issues/232) [#233](https://github.com/hirosystems/token-metadata-api/issues/233) [#234](https://github.com/hirosystems/token-metadata-api/issues/234) [#235](https://github.com/hirosystems/token-metadata-api/issues/235) [#236](https://github.com/hirosystems/token-metadata-api/issues/236)

## [0.7.0](https://github.com/hirosystems/token-metadata-api/compare/v0.6.3...v0.7.0) (2024-05-13)


### Features

* add admin rpc to reprocess token image cache ([#205](https://github.com/hirosystems/token-metadata-api/issues/205)) ([2fdcb33](https://github.com/hirosystems/token-metadata-api/commit/2fdcb33908062770da4e334810fd04bb378db66a))
* update ts client with image thumbnails ([#206](https://github.com/hirosystems/token-metadata-api/issues/206)) ([c24cb56](https://github.com/hirosystems/token-metadata-api/commit/c24cb56b854123b252eb2e2616bb8589c5b36f0f))
* upload token images to gcs ([#204](https://github.com/hirosystems/token-metadata-api/issues/204)) ([1cec219](https://github.com/hirosystems/token-metadata-api/commit/1cec2195a2b3df9e9c85f0152732594caa8c8c51))


### Bug Fixes

* get access token properly ([a6b98c5](https://github.com/hirosystems/token-metadata-api/commit/a6b98c5099a9de1d88e74eed66dece1c4c157422))
* get gcs auth token dynamically for image cache ([#210](https://github.com/hirosystems/token-metadata-api/issues/210)) ([8434b22](https://github.com/hirosystems/token-metadata-api/commit/8434b229f6d38e6799bf84bd6f1eb4de106996bb))
* image cache agent arg types ([5826628](https://github.com/hirosystems/token-metadata-api/commit/5826628a329225fbf697a092dc201fc74fb96d43))
* improve image cache error handling ([#214](https://github.com/hirosystems/token-metadata-api/issues/214)) ([115a745](https://github.com/hirosystems/token-metadata-api/commit/115a745c268e7bb8115a488ca111e8b46cefed62))
* reuse gcs token and validate image cache script errors ([#213](https://github.com/hirosystems/token-metadata-api/issues/213)) ([5e1af5c](https://github.com/hirosystems/token-metadata-api/commit/5e1af5c28cd0b1313f78a59b015669ceb07e5738))

## [0.7.0-beta.5](https://github.com/hirosystems/token-metadata-api/compare/v0.7.0-beta.4...v0.7.0-beta.5) (2024-05-13)


### Bug Fixes

* improve image cache error handling ([#214](https://github.com/hirosystems/token-metadata-api/issues/214)) ([115a745](https://github.com/hirosystems/token-metadata-api/commit/115a745c268e7bb8115a488ca111e8b46cefed62))

## [0.7.0-beta.4](https://github.com/hirosystems/token-metadata-api/compare/v0.7.0-beta.3...v0.7.0-beta.4) (2024-05-08)


### Bug Fixes

* get access token properly ([a6b98c5](https://github.com/hirosystems/token-metadata-api/commit/a6b98c5099a9de1d88e74eed66dece1c4c157422))

## [0.7.0-beta.3](https://github.com/hirosystems/token-metadata-api/compare/v0.7.0-beta.2...v0.7.0-beta.3) (2024-05-07)


### Bug Fixes

* image cache agent arg types ([5826628](https://github.com/hirosystems/token-metadata-api/commit/5826628a329225fbf697a092dc201fc74fb96d43))

## [0.7.0-beta.2](https://github.com/hirosystems/token-metadata-api/compare/v0.7.0-beta.1...v0.7.0-beta.2) (2024-05-07)


### Bug Fixes

* reuse gcs token and validate image cache script errors ([#213](https://github.com/hirosystems/token-metadata-api/issues/213)) ([5e1af5c](https://github.com/hirosystems/token-metadata-api/commit/5e1af5c28cd0b1313f78a59b015669ceb07e5738))

## [0.7.0-beta.1](https://github.com/hirosystems/token-metadata-api/compare/v0.6.3...v0.7.0-beta.1) (2024-05-07)


### Features

* add admin rpc to reprocess token image cache ([#205](https://github.com/hirosystems/token-metadata-api/issues/205)) ([2fdcb33](https://github.com/hirosystems/token-metadata-api/commit/2fdcb33908062770da4e334810fd04bb378db66a))
* update ts client with image thumbnails ([#206](https://github.com/hirosystems/token-metadata-api/issues/206)) ([c24cb56](https://github.com/hirosystems/token-metadata-api/commit/c24cb56b854123b252eb2e2616bb8589c5b36f0f))
* upload token images to gcs ([#204](https://github.com/hirosystems/token-metadata-api/issues/204)) ([1cec219](https://github.com/hirosystems/token-metadata-api/commit/1cec2195a2b3df9e9c85f0152732594caa8c8c51))


### Bug Fixes

* get gcs auth token dynamically for image cache ([#210](https://github.com/hirosystems/token-metadata-api/issues/210)) ([8434b22](https://github.com/hirosystems/token-metadata-api/commit/8434b229f6d38e6799bf84bd6f1eb4de106996bb))

## [0.6.3](https://github.com/hirosystems/token-metadata-api/compare/v0.6.2...v0.6.3) (2024-05-07)


### Bug Fixes

* retry `NoSuchContract` clarity errors ([#209](https://github.com/hirosystems/token-metadata-api/issues/209)) ([b7b6e84](https://github.com/hirosystems/token-metadata-api/commit/b7b6e84c5849fdfa0ce4d9520d0f8ae84f692910))

## [0.6.2](https://github.com/hirosystems/token-metadata-api/compare/v0.6.1...v0.6.2) (2024-05-07)


### Bug Fixes

* handle missing image uris ([#207](https://github.com/hirosystems/token-metadata-api/issues/207)) ([a540ae0](https://github.com/hirosystems/token-metadata-api/commit/a540ae033c52161c5a5040304b8b992d31a4077c))

## [0.6.1](https://github.com/hirosystems/token-metadata-api/compare/v0.6.0...v0.6.1) (2024-02-27)


### Bug Fixes

* accept FTs with incorrect return type for get-token-supply ([#197](https://github.com/hirosystems/token-metadata-api/issues/197)) ([116248c](https://github.com/hirosystems/token-metadata-api/commit/116248c7af09a6658b5542a4c900159a10c38b47))

## [0.6.0](https://github.com/hirosystems/token-metadata-api/compare/v0.5.0...v0.6.0) (2023-12-20)


### Features

* make FT search on name and symbol case insensitive ([#187](https://github.com/hirosystems/token-metadata-api/issues/187)) ([5187e59](https://github.com/hirosystems/token-metadata-api/commit/5187e598e40a3b53400e9c1f63942257192222d5))


### Bug Fixes

* run tests in band ([#190](https://github.com/hirosystems/token-metadata-api/issues/190)) ([989575e](https://github.com/hirosystems/token-metadata-api/commit/989575ef8b53a513b77f5b0f509ed538591104f7))
* semantic release ([#191](https://github.com/hirosystems/token-metadata-api/issues/191)) ([0a81fdb](https://github.com/hirosystems/token-metadata-api/commit/0a81fdb080d962d7390de374327aa2b3d59b28c8))
* skip migrations during readonly mode ([#183](https://github.com/hirosystems/token-metadata-api/issues/183)) ([f658e0d](https://github.com/hirosystems/token-metadata-api/commit/f658e0d7e9fb4d52a63f936d5e2f55c3e11a3c8a))

## [0.5.0](https://github.com/hirosystems/token-metadata-api/compare/v0.4.0...v0.5.0) (2023-08-02)


### Features

* add contract principal to ft index responses ([#180](https://github.com/hirosystems/token-metadata-api/issues/180)) ([57d0468](https://github.com/hirosystems/token-metadata-api/commit/57d04683ce7d72d15484d8cbf8ab36253261bf30))

## [0.4.0](https://github.com/hirosystems/token-metadata-api/compare/v0.3.1...v0.4.0) (2023-06-30)


### Features

* add endpoint to list all FTs ([#167](https://github.com/hirosystems/token-metadata-api/issues/167)) ([af1e886](https://github.com/hirosystems/token-metadata-api/commit/af1e88661e344d407fcc96451ceb64cb224d2939))

## [0.3.1](https://github.com/hirosystems/token-metadata-api/compare/v0.3.0...v0.3.1) (2023-06-15)


### Bug Fixes

* only warn when sip-019 contract is not found ([#162](https://github.com/hirosystems/token-metadata-api/issues/162)) ([55dcde1](https://github.com/hirosystems/token-metadata-api/commit/55dcde1a472f068cc2928125cd1e122d2d6d9c84))
* run prometheus on port 9153 ([#165](https://github.com/hirosystems/token-metadata-api/issues/165)) ([2fa0d93](https://github.com/hirosystems/token-metadata-api/commit/2fa0d93c11764da7dff2a39b94606938ecafbcd7))

## [0.3.0](https://github.com/hirosystems/token-metadata-api/compare/v0.2.1...v0.3.0) (2023-04-03)


### Features

* add `invalid` job status to mark invalid contracts or tokens ([#148](https://github.com/hirosystems/token-metadata-api/issues/148)) ([5d6ef41](https://github.com/hirosystems/token-metadata-api/commit/5d6ef419a594bbe01c54d2905707a4bc6a2a8e2f))


### Bug Fixes

* support FTs with missing metadata but correct token data ([#150](https://github.com/hirosystems/token-metadata-api/issues/150)) ([0a5558e](https://github.com/hirosystems/token-metadata-api/commit/0a5558e4c184aa6989b48361ae3ed3fc1b363ee7))

## [0.2.1](https://github.com/hirosystems/token-metadata-api/compare/v0.2.0...v0.2.1) (2023-03-17)


### Bug Fixes

* do not retry incorrect clarity values ([#143](https://github.com/hirosystems/token-metadata-api/issues/143)) ([272064a](https://github.com/hirosystems/token-metadata-api/commit/272064aaf39b80cefe16418ac80d8d1c0ca08674))

## [0.2.0](https://github.com/hirosystems/token-metadata-api/compare/v0.1.1...v0.2.0) (2023-03-17)


### Features

* add admin RPC interface ([#136](https://github.com/hirosystems/token-metadata-api/issues/136)) ([1f4b4aa](https://github.com/hirosystems/token-metadata-api/commit/1f4b4aabb37fe8c4805314f7e8eb268c6de749b6))

## [0.1.1](https://github.com/hirosystems/token-metadata-api/compare/v0.1.0...v0.1.1) (2023-03-14)


### Bug Fixes

* return FT metadata in a backwards compatible way ([#130](https://github.com/hirosystems/token-metadata-api/issues/130)) ([3ca57a0](https://github.com/hirosystems/token-metadata-api/commit/3ca57a06bb14423a374cd7ceac368c1a6fbf0f57))

## [0.1.0](https://github.com/hirosystems/token-metadata-service/compare/v0.0.1...v0.1.0) (2023-02-22)


### Features

* add server version to status endpoint and rendered docs ([#76](https://github.com/hirosystems/token-metadata-service/issues/76)) ([ba2f7de](https://github.com/hirosystems/token-metadata-service/commit/ba2f7de52996fe57c89298b98a7fd33e3db186f1))
* enable run modes ([#116](https://github.com/hirosystems/token-metadata-service/issues/116)) ([c7a9c55](https://github.com/hirosystems/token-metadata-service/commit/c7a9c553217f5dcc9c1f30db3d8d29200504e930))
* import sip-019 notifications during boot ([#81](https://github.com/hirosystems/token-metadata-service/issues/81)) ([6c28037](https://github.com/hirosystems/token-metadata-service/commit/6c2803703560fa42d5b15b25a83e877ad879f20b))
* refresh dynamic metadata tokens periodically ([#64](https://github.com/hirosystems/token-metadata-service/issues/64)) ([e1c0882](https://github.com/hirosystems/token-metadata-service/commit/e1c08825e5148ee0c99a9d0e240bf386934a9c4b))
* throttle requests to rate limited domains ([#97](https://github.com/hirosystems/token-metadata-service/issues/97)) ([5b75060](https://github.com/hirosystems/token-metadata-service/commit/5b75060157f9e8ec170176a8ba76c73eb7423cd3))


### Bug Fixes

* add `/metadata/v1` prefix to all routes ([#100](https://github.com/hirosystems/token-metadata-service/issues/100)) ([a11d4be](https://github.com/hirosystems/token-metadata-service/commit/a11d4be8abeb08ce192ea4e3f01d1da6db960733))
* add cache-control, remove cache for error responses ([#114](https://github.com/hirosystems/token-metadata-service/issues/114)) ([e03caf8](https://github.com/hirosystems/token-metadata-service/commit/e03caf8e488bb0ad5911a40d68319391ef1cdca6))
* contract log queries ([4bd2812](https://github.com/hirosystems/token-metadata-service/commit/4bd2812e135ea1ccb242b0b26f7a0ab62ea65048))
* display cached image in metadata responses ([#104](https://github.com/hirosystems/token-metadata-service/issues/104)) ([156e9e2](https://github.com/hirosystems/token-metadata-service/commit/156e9e2e5b886cf1bd8fe7065cbf0f073e98b832))
* dockerfile CMD path ([#91](https://github.com/hirosystems/token-metadata-service/issues/91)) ([de60556](https://github.com/hirosystems/token-metadata-service/commit/de605568415582f2b8c8451b02864827099d5b66))
* enclose response etag in double quotes ([#113](https://github.com/hirosystems/token-metadata-service/issues/113)) ([2b77cfe](https://github.com/hirosystems/token-metadata-service/commit/2b77cfec24c1d1cba6857525fd9321628c7f3b9a))
* etag cache calculation with url prefix ([#111](https://github.com/hirosystems/token-metadata-service/issues/111)) ([f872f93](https://github.com/hirosystems/token-metadata-service/commit/f872f9365e2d95ec051cfb4838881eb01e5c3df6))
* follow redirects when fetching metadata ([#109](https://github.com/hirosystems/token-metadata-service/issues/109)) ([0ab2fbb](https://github.com/hirosystems/token-metadata-service/commit/0ab2fbb8eabf59b5ccaa4eef7d6c4b65d979f40e))
* generate git info on docker build ([#93](https://github.com/hirosystems/token-metadata-service/issues/93)) ([9808b47](https://github.com/hirosystems/token-metadata-service/commit/9808b47d37d8a7ce2c720a96ddcd5e0db2e7ff5a))
* handle pg disconnections and transaction management ([#92](https://github.com/hirosystems/token-metadata-service/issues/92)) ([201d813](https://github.com/hirosystems/token-metadata-service/commit/201d813241731bb634951e9534ad40f84842c6f9))
* ignore invalid ssl certs for metadata fetch ([#107](https://github.com/hirosystems/token-metadata-service/issues/107)) ([46e184c](https://github.com/hirosystems/token-metadata-service/commit/46e184c9d773fc520ae95a9f93c2c35893b0e53b))
* ignore ts type maps when migrating ([#95](https://github.com/hirosystems/token-metadata-service/issues/95)) ([b92b9d8](https://github.com/hirosystems/token-metadata-service/commit/b92b9d80f8ebe5b7e0d15b22a55900d389ee20b1))
* improve SIGINT handling for queued jobs ([e16fcd5](https://github.com/hirosystems/token-metadata-service/commit/e16fcd5a5aba053620961538c6b3757cdc5523c5))
* jsonb type interpretation on endpoints ([5985c80](https://github.com/hirosystems/token-metadata-service/commit/5985c8075c244c4414e5b73460a7267dc535a13f))
* jsonb value insertions ([8dff8a6](https://github.com/hirosystems/token-metadata-service/commit/8dff8a601e78652961ab9f1a1c7b36e65a658c8c))
* make importer wait for API height to catch up if it's behind ([#101](https://github.com/hirosystems/token-metadata-service/issues/101)) ([930cce3](https://github.com/hirosystems/token-metadata-service/commit/930cce3c6660bdc98181d5c5bced94c0bd46699c))
* manage additional timeout errors on metadata fetch ([e658e1d](https://github.com/hirosystems/token-metadata-service/commit/e658e1ddd7d8580180e8baed8045b09be274e67c))
* move from fetch to request to fix ENOBUFS ([9b26439](https://github.com/hirosystems/token-metadata-service/commit/9b2643948e9ec7b8d8fe102e47a062c26ff147db))
* persist http agent for metadata fetches ([a30641a](https://github.com/hirosystems/token-metadata-service/commit/a30641ab14839978caef0feb78345fb92a39ece2))
* retry 429 and gateway timeouts ([08cdce6](https://github.com/hirosystems/token-metadata-service/commit/08cdce64157800d28635ffc67c27ca3e08eaae2a))
* sft_mint detection ([53673b2](https://github.com/hirosystems/token-metadata-service/commit/53673b22f6238b062ec17f34ba9faa4fcaa76e01))
* shut down queue at the end of sequence ([e268c79](https://github.com/hirosystems/token-metadata-service/commit/e268c79177e6f0a52556a14174f1b57a828af3ee))
* support JSON5 metadata strings ([#106](https://github.com/hirosystems/token-metadata-service/issues/106)) ([d19634f](https://github.com/hirosystems/token-metadata-service/commit/d19634f5dae83f769e14956edc842b382f08c763))
* uintcv creation ([780b160](https://github.com/hirosystems/token-metadata-service/commit/780b1607497d089e454389c6180abb7a3cdb733d))
* update_at jobs on status or retry change ([c16025f](https://github.com/hirosystems/token-metadata-service/commit/c16025fa1e86fa7d74c5ac24ab439b1d3a56084b))

## [0.1.0-beta.12](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.11...v0.1.0-beta.12) (2023-02-21)


### Features

* enable run modes ([#116](https://github.com/hirosystems/token-metadata-service/issues/116)) ([c7a9c55](https://github.com/hirosystems/token-metadata-service/commit/c7a9c553217f5dcc9c1f30db3d8d29200504e930))

## [0.1.0-beta.11](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.10...v0.1.0-beta.11) (2023-02-09)


### Bug Fixes

* add cache-control, remove cache for error responses ([#114](https://github.com/hirosystems/token-metadata-service/issues/114)) ([e03caf8](https://github.com/hirosystems/token-metadata-service/commit/e03caf8e488bb0ad5911a40d68319391ef1cdca6))

## [0.1.0-beta.10](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.9...v0.1.0-beta.10) (2023-02-09)


### Bug Fixes

* enclose response etag in double quotes ([#113](https://github.com/hirosystems/token-metadata-service/issues/113)) ([2b77cfe](https://github.com/hirosystems/token-metadata-service/commit/2b77cfec24c1d1cba6857525fd9321628c7f3b9a))

## [0.1.0-beta.9](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.8...v0.1.0-beta.9) (2023-02-09)


### Bug Fixes

* etag cache calculation with url prefix ([#111](https://github.com/hirosystems/token-metadata-service/issues/111)) ([f872f93](https://github.com/hirosystems/token-metadata-service/commit/f872f9365e2d95ec051cfb4838881eb01e5c3df6))

## [0.1.0-beta.8](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.7...v0.1.0-beta.8) (2023-02-09)


### Bug Fixes

* display cached image in metadata responses ([#104](https://github.com/hirosystems/token-metadata-service/issues/104)) ([156e9e2](https://github.com/hirosystems/token-metadata-service/commit/156e9e2e5b886cf1bd8fe7065cbf0f073e98b832))
* follow redirects when fetching metadata ([#109](https://github.com/hirosystems/token-metadata-service/issues/109)) ([0ab2fbb](https://github.com/hirosystems/token-metadata-service/commit/0ab2fbb8eabf59b5ccaa4eef7d6c4b65d979f40e))
* ignore invalid ssl certs for metadata fetch ([#107](https://github.com/hirosystems/token-metadata-service/issues/107)) ([46e184c](https://github.com/hirosystems/token-metadata-service/commit/46e184c9d773fc520ae95a9f93c2c35893b0e53b))
* make importer wait for API height to catch up if it's behind ([#101](https://github.com/hirosystems/token-metadata-service/issues/101)) ([930cce3](https://github.com/hirosystems/token-metadata-service/commit/930cce3c6660bdc98181d5c5bced94c0bd46699c))
* support JSON5 metadata strings ([#106](https://github.com/hirosystems/token-metadata-service/issues/106)) ([d19634f](https://github.com/hirosystems/token-metadata-service/commit/d19634f5dae83f769e14956edc842b382f08c763))

## [0.1.0-beta.7](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.6...v0.1.0-beta.7) (2023-02-07)


### Bug Fixes

* add `/metadata/v1` prefix to all routes ([#100](https://github.com/hirosystems/token-metadata-service/issues/100)) ([a11d4be](https://github.com/hirosystems/token-metadata-service/commit/a11d4be8abeb08ce192ea4e3f01d1da6db960733))

## [0.1.0-beta.6](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.5...v0.1.0-beta.6) (2023-02-06)


### Features

* throttle requests to rate limited domains ([#97](https://github.com/hirosystems/token-metadata-service/issues/97)) ([5b75060](https://github.com/hirosystems/token-metadata-service/commit/5b75060157f9e8ec170176a8ba76c73eb7423cd3))

## [0.1.0-beta.5](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.4...v0.1.0-beta.5) (2023-02-02)


### Bug Fixes

* handle pg disconnections and transaction management ([#92](https://github.com/hirosystems/token-metadata-service/issues/92)) ([201d813](https://github.com/hirosystems/token-metadata-service/commit/201d813241731bb634951e9534ad40f84842c6f9))

## [0.1.0-beta.4](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.3...v0.1.0-beta.4) (2023-02-01)


### Bug Fixes

* ignore ts type maps when migrating ([#95](https://github.com/hirosystems/token-metadata-service/issues/95)) ([b92b9d8](https://github.com/hirosystems/token-metadata-service/commit/b92b9d80f8ebe5b7e0d15b22a55900d389ee20b1))

## [0.1.0-beta.3](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.2...v0.1.0-beta.3) (2023-02-01)


### Bug Fixes

* generate git info on docker build ([#93](https://github.com/hirosystems/token-metadata-service/issues/93)) ([9808b47](https://github.com/hirosystems/token-metadata-service/commit/9808b47d37d8a7ce2c720a96ddcd5e0db2e7ff5a))

## [0.1.0-beta.2](https://github.com/hirosystems/token-metadata-service/compare/v0.1.0-beta.1...v0.1.0-beta.2) (2023-02-01)


### Bug Fixes

* dockerfile CMD path ([#91](https://github.com/hirosystems/token-metadata-service/issues/91)) ([de60556](https://github.com/hirosystems/token-metadata-service/commit/de605568415582f2b8c8451b02864827099d5b66))

## [0.1.0-beta.1](https://github.com/hirosystems/token-metadata-service/compare/v0.0.1...v0.1.0-beta.1) (2023-01-26)


### Features

* add server version to status endpoint and rendered docs ([#76](https://github.com/hirosystems/token-metadata-service/issues/76)) ([ba2f7de](https://github.com/hirosystems/token-metadata-service/commit/ba2f7de52996fe57c89298b98a7fd33e3db186f1))
* import sip-019 notifications during boot ([#81](https://github.com/hirosystems/token-metadata-service/issues/81)) ([6c28037](https://github.com/hirosystems/token-metadata-service/commit/6c2803703560fa42d5b15b25a83e877ad879f20b))
* refresh dynamic metadata tokens periodically ([#64](https://github.com/hirosystems/token-metadata-service/issues/64)) ([e1c0882](https://github.com/hirosystems/token-metadata-service/commit/e1c08825e5148ee0c99a9d0e240bf386934a9c4b))


### Bug Fixes

* contract log queries ([4bd2812](https://github.com/hirosystems/token-metadata-service/commit/4bd2812e135ea1ccb242b0b26f7a0ab62ea65048))
* improve SIGINT handling for queued jobs ([e16fcd5](https://github.com/hirosystems/token-metadata-service/commit/e16fcd5a5aba053620961538c6b3757cdc5523c5))
* jsonb type interpretation on endpoints ([5985c80](https://github.com/hirosystems/token-metadata-service/commit/5985c8075c244c4414e5b73460a7267dc535a13f))
* jsonb value insertions ([8dff8a6](https://github.com/hirosystems/token-metadata-service/commit/8dff8a601e78652961ab9f1a1c7b36e65a658c8c))
* manage additional timeout errors on metadata fetch ([e658e1d](https://github.com/hirosystems/token-metadata-service/commit/e658e1ddd7d8580180e8baed8045b09be274e67c))
* move from fetch to request to fix ENOBUFS ([9b26439](https://github.com/hirosystems/token-metadata-service/commit/9b2643948e9ec7b8d8fe102e47a062c26ff147db))
* persist http agent for metadata fetches ([a30641a](https://github.com/hirosystems/token-metadata-service/commit/a30641ab14839978caef0feb78345fb92a39ece2))
* retry 429 and gateway timeouts ([08cdce6](https://github.com/hirosystems/token-metadata-service/commit/08cdce64157800d28635ffc67c27ca3e08eaae2a))
* sft_mint detection ([53673b2](https://github.com/hirosystems/token-metadata-service/commit/53673b22f6238b062ec17f34ba9faa4fcaa76e01))
* shut down queue at the end of sequence ([e268c79](https://github.com/hirosystems/token-metadata-service/commit/e268c79177e6f0a52556a14174f1b57a828af3ee))
* uintcv creation ([780b160](https://github.com/hirosystems/token-metadata-service/commit/780b1607497d089e454389c6180abb7a3cdb733d))
* update_at jobs on status or retry change ([c16025f](https://github.com/hirosystems/token-metadata-service/commit/c16025fa1e86fa7d74c5ac24ab439b1d3a56084b))
