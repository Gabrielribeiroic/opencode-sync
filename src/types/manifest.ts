/**
 * Manifest Types - Storage metadata and sync state
 */

import type { VectorClock } from './vector-clock.js';
import type { SyncCategory } from './categories.js';

/**
 * Legacy category info (blob-based sync).
 * Used for: config, state, credentials, projects, todos
 */
export interface BlobCategoryInfo {
  type: 'blob';
  files: string[]; // Chunk filenames in storage
  totalSize: number; // Uncompressed bytes
  compressedSize: number; // Compressed bytes
  checksum: string; // SHA-256 of combined data
  lastModified: string; // ISO timestamp
  lastModifiedBy: string; // Machine ID
  vectorClock: VectorClock; // Category-specific vector clock
}

/**
 * Per-item category info (granular sync).
 * Used for: sessions, messages
 */
export interface ItemCategoryInfo {
  type: 'items';
  /** Map of item ID → item metadata */
  items: Record<string, ItemInfo>;
  /** Map of item ID → tombstone for deleted items */
  tombstones: Record<string, Tombstone>;
  /** Total number of live items (excludes tombstoned) */
  itemCount: number;
  lastModified: string; // ISO timestamp
  lastModifiedBy: string; // Machine ID
  vectorClock: VectorClock; // Category-specific vector clock
}

/** Metadata for a single item in per-item sync */
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

/** Union type for category info */
export type CategoryInfo = BlobCategoryInfo | ItemCategoryInfo;

/** Check if category uses per-item sync */
export function isItemCategory(info: CategoryInfo): info is ItemCategoryInfo {
  return info.type === 'items';
}

/** Check if category uses blob sync */
export function isBlobCategory(info: CategoryInfo): info is BlobCategoryInfo {
  return info.type === 'blob';
}

/** Categories that use per-item sync */
export const ITEM_SYNC_CATEGORIES: SyncCategory[] = ['sessions', 'messages'];

/** Check if a category should use per-item sync */
export function shouldUseItemSync(category: SyncCategory): boolean {
  return ITEM_SYNC_CATEGORIES.includes(category);
}

/**
 * Sharded Manifest Support
 *
 * For categories with many items (sessions, messages), the manifest can grow large.
 * Sharding splits category metadata into separate files:
 * - Root manifest: lightweight, contains category checksums + shard references
 * - Category shards: per-category files with detailed item info
 */

/** Summary info for a sharded category (stored in root manifest) */
export interface ShardedCategoryRef {
  type: 'sharded';
  /** Filename of the shard (e.g., "manifest-sessions.json") */
  shardFile: string;
  /** SHA-256 of the shard file content */
  shardChecksum: string;
  /** Total number of items (for quick display without loading shard) */
  itemCount: number;
  /** Number of tombstones (for metrics) */
  tombstoneCount: number;
  lastModified: string;
  lastModifiedBy: string;
  vectorClock: VectorClock;
}

/** Extended category info union including sharded reference */
export type ExtendedCategoryInfo = CategoryInfo | ShardedCategoryRef;

/** Check if category info is a sharded reference */
export function isShardedRef(info: ExtendedCategoryInfo): info is ShardedCategoryRef {
  return info.type === 'sharded';
}

/** Get shard filename for a category */
export function getShardFilename(category: SyncCategory): string {
  return `manifest-${category}.json`;
}

/** Content of a category shard file */
export interface CategoryShard {
  /** Category this shard belongs to */
  category: SyncCategory;
  /** Schema version for forward compatibility */
  schemaVersion: '1.0';
  /** Map of item ID → item metadata */
  items: Record<string, ItemInfo>;
  /** Map of item ID → tombstone for deleted items */
  tombstones: Record<string, Tombstone>;
  /** Last updated timestamp */
  updatedAt: string;
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
  schemaVersion: '1.0' | '2.0' | '2.1'; // 2.1 adds sharding support
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy: string; // Machine ID

  // Global vector clock for conflict detection
  vectorClock: VectorClock;

  // Per-category tracking (supports blob, items, and sharded references)
  categories: Partial<Record<SyncCategory, CategoryInfo | ShardedCategoryRef>>;

  // Advisory lock (soft lock, not enforced)
  advisoryLock?: AdvisoryLock;

  // History of recent syncs for debugging
  recentSyncs: SyncHistoryEntry[];
}

export function createEmptyManifest(machineId: string): Manifest {
  const now = new Date().toISOString();
  return {
    version: 0,
    schemaVersion: '2.0',
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
