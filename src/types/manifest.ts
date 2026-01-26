/**
 * Manifest Types - Storage metadata and sync state
 */

import type { SyncCategory } from './categories.js';

/** Metadata for a single item */
export interface ItemInfo {
  /** Filename in storage (e.g., "sessions/ses_abc123.json.gz") */
  filename: string;
  /** SHA-256 hash of the uncompressed content */
  checksum: string;
  /** Compressed size in bytes */
  size: number;
  /** Last modified timestamp */
  lastModified: string;
  /** Machine that last modified this item */
  lastModifiedBy: string;
}

/** Tombstone record for deleted items */
export interface Tombstone {
  /** ID of the deleted item (e.g., "session/ses_abc123.json") */
  itemId: string;
  /** ISO timestamp when the item was deleted */
  deletedAt: string;
  /** Machine ID that performed the deletion */
  deletedBy: string;
  /** ISO timestamp when this tombstone expires and can be garbage collected */
  expiresAt: string;
}

/** Default tombstone grace period in days */
export const DEFAULT_TOMBSTONE_GRACE_DAYS = 30;

/**
 * Tree-Indexed Category Info
 *
 * All categories use tree-indexed sync where Git Tree API is the source of truth.
 * Benefits:
 * - Manifest stays small (no per-item tracking)
 * - Tree API returns file list + SHAs in 1 call (100K file limit)
 * - Tombstones stored separately in tombstones.json
 */
export interface TreeIndexedCategoryInfo {
  type: 'tree-indexed';
  /** Directory prefix in storage (e.g., "sessions/", "messages/") */
  pathPrefix: string;
  /** Total number of items (cached for quick display, updated on push) */
  itemCount: number;
  lastModified: string; // ISO timestamp - used for sync decisions
  lastModifiedBy: string; // Machine ID
}

/** Category info type (all categories use tree-indexed) */
export type CategoryInfo = TreeIndexedCategoryInfo;

/**
 * Tombstones File (tombstones.json)
 *
 * Separate file for tracking deleted items. This allows:
 * - Append-only semantics (merge-friendly)
 * - Small manifest (no tombstones inline)
 * - Easy cleanup of expired tombstones
 */
export interface TombstonesFile {
  schemaVersion: '1.0';
  /** Map of category → { itemId → tombstone } */
  tombstones: Partial<Record<SyncCategory, Record<string, Tombstone>>>;
  updatedAt: string;
}

/** Tombstones filename */
export const TOMBSTONES_FILENAME = 'tombstones.json';

/** Create empty tombstones file */
export function createEmptyTombstonesFile(): TombstonesFile {
  return {
    schemaVersion: '1.0',
    tombstones: {},
    updatedAt: new Date().toISOString(),
  };
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
  schemaVersion: '5.0'; // 5.0 = all categories tree-indexed, no blobs
  createdAt: string;
  updatedAt: string; // ISO timestamp - used for sync direction decisions
  lastUpdatedBy: string; // Machine ID

  // Per-category tracking (all tree-indexed)
  categories: Partial<Record<SyncCategory, CategoryInfo>>;

  // Advisory lock (soft lock, not enforced)
  advisoryLock?: AdvisoryLock;

  // History of recent syncs for debugging
  recentSyncs: SyncHistoryEntry[];
}

/** Current schema version for new manifests */
export const CURRENT_SCHEMA_VERSION = '5.0' as const;

export function createEmptyManifest(machineId: string): Manifest {
  const now = new Date().toISOString();
  return {
    version: 0,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    lastUpdatedBy: machineId,
    categories: {},
    recentSyncs: [],
  };
}

/** Maximum number of sync history entries to keep */
export const MAX_SYNC_HISTORY = 50;
