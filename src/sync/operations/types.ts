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
} from '../../types/index.js';

export interface CategoryData {
  category: SyncCategory;
  data: string;
  isJsonl?: boolean;
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

export { type SyncResult, type Manifest, type SyncCategory, type LocalSyncState };
