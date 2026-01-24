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
export type { CategoryInfo, AdvisoryLock, SyncHistoryEntry, Manifest } from './manifest.js';
export { createEmptyManifest, MAX_SYNC_HISTORY } from './manifest.js';

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
