/**
 * OpenCode Sync - Type Definitions
 *
 * Re-exports all types from organized modules
 */

// Vector Clock
export type { VectorClock, VectorClockComparison } from './vector-clock.js';

// Configuration
export type { SyncConfig } from './config.js';
export { DEFAULT_CONFIG } from './config.js';

// Categories
export type { SyncCategory } from './categories.js';
export { SYNC_CATEGORIES, isSyncCategory } from './categories.js';

// Manifest
export type {
  CategoryInfo,
  BlobCategoryInfo,
  ItemCategoryInfo,
  ItemInfo,
  Tombstone,
  AdvisoryLock,
  SyncHistoryEntry,
  Manifest,
  // Sharded manifest types
  ShardedCategoryRef,
  CategoryShard,
  ExtendedCategoryInfo,
} from './manifest.js';
export {
  createEmptyManifest,
  MAX_SYNC_HISTORY,
  isItemCategory,
  isBlobCategory,
  shouldUseItemSync,
  ITEM_SYNC_CATEGORIES,
  DEFAULT_TOMBSTONE_GRACE_DAYS,
  // Sharded manifest helpers
  isShardedRef,
  getShardFilename,
  SHARDING_THRESHOLD,
  shouldShard,
} from './manifest.js';

// Sync Operations
export type {
  LocalSyncState,
  SyncAction,
  SyncResult,
  ConflictInfo,
  PackedChunk,
  PackedCategory,
  EncryptedData,
  WatcherEvent,
} from './sync.js';

// Paths
export type { PathConfig } from './paths.js';
export { getPathConfig, getCategoryPaths, getCategoryForPath } from './paths.js';
