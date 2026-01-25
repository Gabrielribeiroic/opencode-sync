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
} from '../../types/index.js';

/**
 * Blob-based category data (config, state, credentials, projects, todos).
 * All data packed into a single blob.
 */
export interface BlobCategoryData {
  category: SyncCategory;
  type: 'blob';
  data: string;
  isJsonl?: boolean;
}

/**
 * Per-item category data (sessions, messages).
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

/** Union type for category data */
export type CategoryData = BlobCategoryData | ItemCategoryData;

/** Check if category data is blob-based */
export function isBlobCategoryData(data: CategoryData): data is BlobCategoryData {
  return data.type === 'blob';
}

/** Check if category data is item-based */
export function isItemCategoryData(data: CategoryData): data is ItemCategoryData {
  return data.type === 'items';
}

/** Storage files structure (backend-agnostic) */
export type StorageFiles = Record<string, { content?: string; sha?: string }>;

/** Options for encryption/decryption with key rotation support */
export interface CryptoOptions {
  /** Current encryption key */
  passphrase?: string;
  /** Previous encryption key for decryption fallback during key rotation */
  oldPassphrase?: string;
}

/** Passphrase can be a string (legacy) or CryptoOptions (with key rotation support) */
export type PassphraseOption = string | CryptoOptions | undefined;

export interface OperationContext {
  config: SyncConfig;
  localState: LocalSyncState | null;
  passphrase: PassphraseOption;
}

export interface PushContext extends OperationContext {
  files: Record<string, { content: string | null }>; // null = delete file
  manifest: Manifest;
  now: string;
  machineId: string;
  newClock: Record<string, number>;
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
