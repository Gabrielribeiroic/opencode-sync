# TODO

## Completed

- [x] Push optimization: inline content in tree (O(n) → O(1))
- [x] **Pull optimization: GraphQL batch fetch (O(n) → O(1))**
  - Uses GitHub GraphQL API with aliases to fetch multiple files in 1 request
  - 100 files = 1 API call (vs 100+ REST API calls before)
  - Replaced CDN + Blob API fallback with reliable GraphQL approach
- [x] Rate limit detection and backoff
- [x] Skip push when no changes
- [x] **Timestamp-based sync** - replaced vector clocks with simple lastModified comparison
  - Removed vectorClock from LocalSyncState, Manifest, and all category types
  - Replaced compareVectorClocks with compareTimestamps (lastSyncedAt vs updatedAt)
  - Removed concurrent state detection (now uses last-write-wins)
  - Bumped manifest schema to 3.0
- [x] Checksum-based change detection
- [x] Manifest structure for tracking files
- [x] Tombstones for deletion tracking
- [x] Per-file granularity (not repo-level overwrite)
- [x] Pull-then-push flow (when remote is newer, pull first then push local changes)
- [x] Consolidate logger files - unified logging system with ports & adapters pattern

## Completed: Code Quality & Refactoring

### High Priority
- [x] **Consolidate encoding utilities** - `packer.ts` & `item-packer.ts` have identical `calculateChecksum()`, `uint8ArrayToBase64()`, `base64ToUint8Array()`
  - Created `src/shared/encoding-utils.ts` with shared encoding functions
- [x] **Extract error handling pattern** - pattern `error instanceof Error ? error.message : String(error)` repeated in 5+ files
  - Created `src/shared/error-utils.ts` with `getErrorMessage()`, `getErrorStack()`, `toError()`, `isError()`
- [x] **Consolidate sync result processing** - `background-sync.ts` & `sync-handler.ts` have duplicate write/persist logic
  - Created `src/shared/sync-result-handler.ts` with `writePulledData()`, `persistLocalState()`, `processSyncResult()`

### Medium Priority
- [x] **Unify error classes** - 6 error classes (`RepoApiError`, `SyncError`, `EncryptionError`, `PackerError`, `ItemPackerError`, `MergeError`) unified
  - Created `src/shared/errors.ts` with `AppError` base class and all domain error classes
- [x] **Centralize retry configuration** - retry constants scattered across `fetch.ts`, `constants.ts`, `retry.ts`
  - Created `src/shared/retry-config.ts` with `CONFLICT_RETRY` and `API_RETRY` config objects, plus `calculateBackoff()` and `sleep()` utilities
- [x] **Extract plugin state validation** - `if (!state.config || !state.engine)` pattern in 3+ files
  - Created `src/plugin/validation.ts` with type guards: `hasConfig()`, `isPluginReady()`, `isContinuousSyncReady()`, `isFullyInitialized()`
- [x] **Move CryptoOptions type** - currently in `operations/types.ts`, should be in `src/types/crypto.ts`
  - Created `src/types/crypto.ts` with `CryptoOptions` and `PassphraseOption` types, re-exported from `operations/types.ts` for backward compatibility

### Low Priority
- [x] **Review helper duplication** - `engine/helpers.ts` vs `operations/helpers.ts` may have overlapping functionality
  - Reviewed: No duplication found. `engine/helpers.ts` handles orchestration (checksums, pull/push options), `operations/helpers.ts` handles low-level operations (tombstones, manifest, context). Complementary, not duplicative.
- [x] **Consider API client base class** - `http-client.ts` and `graphql-client.ts` have similar initialization patterns
  - Reviewed: Not worth abstracting. Only ~15 lines similar (config fields). Different APIs (REST vs GraphQL), different methods, different URL patterns. Base class would add complexity without benefit.

### Codebase Audit Fixes
- [x] **Architecture violation: shared module imported plugin state** - `sync-result-handler.ts` imported `getPluginState()` from plugin
  - Refactored `persistLocalState()` to accept engine as parameter, callers now handle state updates locally
- [x] **Dead code: duplicate `getCryptoOptions`** - Unused function in `engine/types.ts` duplicated `buildCryptoOptions` in `engine/helpers.ts`
  - Removed unused `getCryptoOptions` from `engine/types.ts`
- [x] **Dead code: unused `removeItemsWithTombstones`** - Function in `tombstone.ts` was never imported
  - Removed unused function

## Dead Code Cleanup (knip analysis)

### Unused Files (11)
- [ ] `src/crypto/index.ts` - barrel export, check if needed for external API
- [ ] `src/data/directory-loader.ts`
- [ ] `src/data/parsers.ts`
- [ ] `src/sync/index.ts` - barrel export, check if needed for external API
- [ ] `src/sync/merge/` - entire directory (index.ts, json-merge.ts, jsonl-merge.ts, types.ts, utils.ts)
- [ ] `src/sync/operations/index.ts` - barrel export, check if needed for external API
- [ ] `src/sync/packer.ts`

### Unused Dependencies
- [ ] `@opencode-ai/plugin` - verify if peer/runtime dependency
- [ ] `eslint-plugin-import` - remove if not used

### Unused Exports - Crypto (4)
- [ ] `deriveKey` in `src/crypto/encrypt.ts`
- [ ] `generateSalt` in `src/crypto/encrypt.ts`
- [ ] `hashPassphrase` in `src/crypto/encrypt.ts`
- [ ] `verifyPassphrase` in `src/crypto/encrypt.ts`

### Unused Exports - Data (2)
- [ ] `ensureDir` in `src/data/file-io.ts`
- [ ] `createInitialConfig` in `src/data/state.ts`

### Unused Exports - Logging (3)
- [ ] `fileLogger` in `src/logging/file-logger.ts`
- [ ] `syncDebug` in `src/logging/file-logger.ts`
- [ ] `startOperation` in `src/logging/file-logger.ts`

### Unused Exports - Sync Engine (15+)
- [ ] `buildLocalChecksums` in `src/sync/engine/helpers.ts`
- [ ] `MAX_CONFLICT_RETRIES` in `src/sync/engine/retry.ts`
- [ ] Multiple re-exports in `src/sync/engine/index.ts`

### Unused Exports - Tombstones (6)
- [ ] `isTombstoneExpired` in `src/sync/tombstone.ts`
- [ ] `isItemTombstoned` in `src/sync/tombstone.ts`
- [ ] `getItemsToDelete` in `src/sync/tombstone.ts`
- [ ] `addTombstone` re-export in `src/sync/tombstone.ts`
- [ ] `mergeTombstonesFiles` re-export in `src/sync/tombstone.ts`
- [ ] `filterExpiredTombstonesFile` re-export in `src/sync/tombstone.ts`

### Unused Exports - Operations (6)
- [ ] `maybeEncrypt` in `src/sync/operations/crypto-helpers.ts`
- [ ] `maybeDecrypt` in `src/sync/operations/crypto-helpers.ts`
- [ ] `parseEncryptedData` in `src/sync/operations/crypto-helpers.ts`
- [ ] `createManifest` in `src/sync/operations/helpers.ts`
- [ ] `getLockFilePath` in `src/sync/local-lock.ts`
- [ ] `readLock` in `src/sync/local-lock.ts`
- [ ] `withLocalLock` in `src/sync/local-lock.ts`

### Unused Exports - Shared (7)
- [ ] `isError` in `src/shared/error-utils.ts`
- [ ] `processSyncResult` in `src/shared/sync-result-handler.ts`
- [ ] `AppError`, `PackerError`, `SyncError`, `MergeError`, `RepoNotFoundError` classes

### Unused Exports - Types (10+)
- [ ] `SYNC_CATEGORIES` in `src/types/categories.ts`
- [ ] `isSyncCategory` in `src/types/categories.ts`
- [ ] `DEFAULT_TOMBSTONE_GRACE_DAYS`, `CURRENT_SCHEMA_VERSION`, `createEmptyTombstonesFile` in `src/types/index.ts`
- [ ] `getCategoryForPath` in `src/types/paths.ts`

### Unused Exported Types (22)
- [ ] `LoadedData`, `LoadError` in `src/data/index.ts`
- [ ] `PluginState` in `src/plugin/index.ts`
- [ ] `MergeConflict`, `StateProvider` in `src/shared/`
- [ ] `SyncAction` in `src/sync/engine/routing.ts`
- [ ] `ItemDiff` in `src/sync/item-packer.ts`
- [ ] `CryptoOptions` duplicate exports
- [ ] `StorageFiles`, `OperationContext`, `ChunkDownloadResult`, `SyncResult` in `src/sync/operations/types.ts`
- [ ] `CategoryInfo`, `AdvisoryLock`, `TombstonesFile`, `PackedCategory`, `LogLevel` in `src/types/`

**Note:** Many "unused" exports may be intentional public API for package consumers. Review before removing.

## In Progress: Safety & Observability

- [ ] Log when local files are overwritten by remote
- [ ] Log when remote files are overwritten by local
- [ ] Add --force-local and --force-remote CLI flags for manual resolution
- [ ] Show warning on config file overwrites
- [ ] Add conflict counter to sync summary

## Backlog: Rate Limit Improvements

- [x] Add exponential backoff retry logic for GitHub API calls (already implemented in fetch.ts)
- [x] Batch file fetches to reduce API call frequency (GraphQL batch fetch)

## Future Enhancements

- [ ] ETag caching for manifest fetch (saves bandwidth, not API calls)
- [ ] GitHub webhook for push notifications (eliminate polling)
- [ ] Compression improvements for large messages
- [ ] Parallel category processing during sync

