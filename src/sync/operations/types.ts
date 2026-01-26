/**
 * Sync Operation Types
 *
 * Shared types for push, pull, and merge operations.
 */

import type {
  SyncCategory,
  SyncResult,
  Manifest,
  LocalSyncState,
  SyncConfig,
  PackedChunk,
  Tombstone,
  PassphraseOption,
} from '../../types/index.js';

/**
 * Per-item category data (all categories use tree-indexed sync).
 * Each item tracked separately for granular sync.
 */
export interface ItemCategoryData {
  category: SyncCategory;
  type: 'items';
  /** Map of item ID → item content (JSON string) */
  items: Record<string, string>;
  /** Map of item ID → checksum for diff detection */
  checksums: Record<string, string>;
  /** Map of item ID → tombstone for locally deleted items */
  tombstones?: Record<string, Tombstone>;
}

/** Category data type (all categories use item-based sync) */
export type CategoryData = ItemCategoryData;

/** Storage files structure (backend-agnostic) */
export type StorageFiles = Record<string, { content?: string; sha?: string }>;

// Re-export crypto types for backward compatibility
export type { CryptoOptions, PassphraseOption } from '../../types/index.js';

export interface OperationContext {
  config: SyncConfig;
  localState: LocalSyncState | null;
  passphrase: PassphraseOption;
}

export interface PushContext extends OperationContext {
  files: Record<string, { content: string | null }>; // null = delete file
  manifest: Manifest;
  now: string; // ISO timestamp for this push operation
  machineId: string;
  /** Accumulated tombstones file content (for tree-indexed categories) */
  tombstonesFileContent?: string;
}

export interface PullResult {
  pulledData: CategoryData[];
  changedCategories: SyncCategory[];
}

export interface ChunkDownloadResult {
  chunks: PackedChunk[];
}

/** Options for push data preparation */
export interface PreparePushOptions {
  localData: CategoryData[];
  config: { machineId: string; sync: Record<SyncCategory, boolean> };
  localState: LocalSyncState | null;
  passphrase: PassphraseOption;
  existingFiles?: string[];
  remoteManifest?: Manifest;
}

export { type SyncResult, type Manifest, type SyncCategory, type LocalSyncState };
