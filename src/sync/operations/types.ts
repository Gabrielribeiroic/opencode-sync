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

export interface OperationContext {
  config: SyncConfig;
  localState: LocalSyncState | null;
  passphrase: string | undefined;
}

export interface PushContext extends OperationContext {
  files: Record<string, { content: string }>;
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
