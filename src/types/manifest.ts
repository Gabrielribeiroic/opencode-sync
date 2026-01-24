/**
 * Manifest Types - Storage metadata and sync state
 */

import type { VectorClock } from './vector-clock.js';
import type { SyncCategory } from './categories.js';

export interface CategoryInfo {
  files: string[]; // Chunk filenames in storage
  totalSize: number; // Uncompressed bytes
  compressedSize: number; // Compressed bytes
  checksum: string; // SHA-256 of combined data
  lastModified: string; // ISO timestamp
  lastModifiedBy: string; // Machine ID
  vectorClock: VectorClock; // Category-specific vector clock
}

export interface AdvisoryLock {
  machine: string;
  since: string; // ISO timestamp
  operation: 'push' | 'pull';
}

export interface SyncHistoryEntry {
  machine: string;
  timestamp: string;
  action: 'push' | 'pull' | 'merge';
  categoriesAffected: SyncCategory[];
}

export interface Manifest {
  version: number; // Incremented on each push
  schemaVersion: '1.0';
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy: string; // Machine ID

  // Global vector clock for conflict detection
  vectorClock: VectorClock;

  // Per-category tracking
  categories: Partial<Record<SyncCategory, CategoryInfo>>;

  // Advisory lock (soft lock, not enforced)
  advisoryLock?: AdvisoryLock;

  // History of recent syncs for debugging
  recentSyncs: SyncHistoryEntry[];
}

export function createEmptyManifest(machineId: string): Manifest {
  const now = new Date().toISOString();
  return {
    version: 0,
    schemaVersion: '1.0',
    createdAt: now,
    updatedAt: now,
    lastUpdatedBy: machineId,
    vectorClock: { [machineId]: 0 },
    categories: {},
    recentSyncs: [],
  };
}

/** Maximum number of sync history entries to keep */
export const MAX_SYNC_HISTORY = 50;
