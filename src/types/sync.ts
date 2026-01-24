/**
 * Sync Operation Types
 */

import type { VectorClock } from './vector-clock.js';
import type { SyncCategory } from './categories.js';

// ============================================================================
// Local Sync State
// ============================================================================

export interface LocalSyncState {
  storageId: string;
  machineId: string;
  lastSyncedVersion: number;
  lastSyncedAt: string;
  vectorClock: VectorClock; // Our view of the global clock after last sync
  categoryChecksums: Partial<Record<SyncCategory, string>>;
  // Base versions for three-way merge (stored after each successful sync)
  baseVersions: Partial<Record<SyncCategory, string>>; // JSON stringified data
}

// ============================================================================
// Sync Results
// ============================================================================

export type SyncAction = 'pushed' | 'pulled' | 'merged' | 'conflict' | 'no-change' | 'error';

export interface SyncResult {
  success: boolean;
  action: SyncAction;
  message: string;
  changedCategories?: SyncCategory[];
  conflicts?: ConflictInfo[];
  error?: Error;
}

export interface ConflictInfo {
  category: SyncCategory;
  localChecksum: string;
  remoteChecksum: string;
  localModifiedBy: string;
  remoteModifiedBy: string;
  resolution: 'auto-merged' | 'local-kept' | 'remote-kept' | 'user-resolved';
}

// ============================================================================
// Data Packing Types
// ============================================================================

export interface PackedChunk {
  index: number;
  filename: string;
  content: string; // base64 encoded gzipped data
  size: number;
}

export interface PackedCategory {
  category: SyncCategory;
  chunks: PackedChunk[];
  totalSize: number;
  compressedSize: number;
  checksum: string;
}

// ============================================================================
// Encryption Types
// ============================================================================

export interface EncryptedData {
  salt: string; // base64
  iv: string; // base64
  authTag: string; // base64
  data: string; // base64
}

// ============================================================================
// File Watcher Types
// ============================================================================

export interface WatcherEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  category: SyncCategory;
}
