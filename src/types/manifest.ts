/**
 * Manifest Types - Storage metadata and sync state
 */

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
  lastModified: string; // ISO timestamp - used for sync decisions
  lastModifiedBy: string; // Machine ID
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
  lastModified: string; // ISO timestamp - used for sync decisions
  lastModifiedBy: string; // Machine ID
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
 * Tree-Indexed Category Support (Schema 4.0)
 *
 * For categories with many items (sessions, messages), we use Git Tree API
 * as the source of truth instead of tracking per-item metadata in manifest.
 *
 * Benefits:
 * - Manifest stays small (no per-item tracking)
 * - Tree API returns file list + SHAs in 1 call (100K file limit)
 * - Tombstones stored separately in tombstones.json
 */

/** Tree-indexed category info (uses Git Tree API as source of truth) */
export interface TreeIndexedCategoryInfo {
  type: 'tree-indexed';
  /** Directory prefix in storage (e.g., "sessions/", "messages/") */
  pathPrefix: string;
  /** Total number of items (cached for quick display, updated on push) */
  itemCount: number;
  lastModified: string; // ISO timestamp - used for sync decisions
  lastModifiedBy: string; // Machine ID
}

/** Check if category uses tree-indexed sync */
export function isTreeIndexedCategory(info: ExtendedCategoryInfo): info is TreeIndexedCategoryInfo {
  return info.type === 'tree-indexed';
}

/** Extended category info union including all types */
export type ExtendedCategoryInfo = CategoryInfo | TreeIndexedCategoryInfo;

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
  schemaVersion: '1.0' | '2.0' | '2.1' | '3.0' | '4.0'; // 4.0 uses tree-indexed categories
  createdAt: string;
  updatedAt: string; // ISO timestamp - used for sync direction decisions
  lastUpdatedBy: string; // Machine ID

  // Per-category tracking (supports blob and tree-indexed)
  categories: Partial<Record<SyncCategory, ExtendedCategoryInfo>>;

  // Advisory lock (soft lock, not enforced)
  advisoryLock?: AdvisoryLock;

  // History of recent syncs for debugging
  recentSyncs: SyncHistoryEntry[];
}

/** Current schema version for new manifests */
export const CURRENT_SCHEMA_VERSION = '4.0' as const;

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
