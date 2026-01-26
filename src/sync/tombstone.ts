/**
 * Tombstone utilities for tracking deleted items across machines.
 *
 * Tombstones are deletion markers that propagate across machines during sync.
 * They ensure that when an item is deleted on one machine, it gets deleted
 * on all other machines during the next sync.
 */

import type { Tombstone, ItemCategoryInfo, TombstonesFile } from '../types/manifest.js';
import type { SyncCategory } from '../types/categories.js';
import { DEFAULT_TOMBSTONE_GRACE_DAYS, createEmptyTombstonesFile } from '../types/manifest.js';

/**
 * Create a new tombstone for a deleted item.
 */
export function createTombstone(
  itemId: string,
  machineId: string,
  graceDays: number = DEFAULT_TOMBSTONE_GRACE_DAYS
): Tombstone {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
  return {
    itemId,
    deletedAt: now.toISOString(),
    deletedBy: machineId,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Check if a tombstone has expired and can be garbage collected.
 */
export function isTombstoneExpired(tombstone: Tombstone, now: Date = new Date()): boolean {
  return new Date(tombstone.expiresAt) < now;
}

/** Result of filtering expired tombstones */
export interface FilterTombstonesResult {
  /** Tombstones that are still valid */
  valid: Record<string, Tombstone>;
  /** Item IDs of expired tombstones */
  expiredIds: string[];
}

/**
 * Filter out expired tombstones from a tombstones record.
 * Returns valid tombstones and list of expired item IDs.
 */
export function filterExpiredTombstones(
  tombstones: Record<string, Tombstone>,
  now: Date = new Date()
): FilterTombstonesResult {
  const expiredIds: string[] = [];
  const valid: Record<string, Tombstone> = {};

  for (const [itemId, tombstone] of Object.entries(tombstones)) {
    if (isTombstoneExpired(tombstone, now)) {
      expiredIds.push(itemId);
    } else {
      valid[itemId] = tombstone;
    }
  }

  return { valid, expiredIds };
}

/**
 * Remove expired tombstones from a category info.
 * Returns the cleaned category info and list of expired item IDs.
 */
export function cleanupExpiredTombstones(
  info: ItemCategoryInfo,
  now: Date = new Date()
): { cleaned: ItemCategoryInfo; expiredIds: string[] } {
  const { valid, expiredIds } = filterExpiredTombstones(info.tombstones, now);
  return {
    cleaned: { ...info, tombstones: valid },
    expiredIds,
  };
}

/**
 * Merge tombstones from two sources.
 * When both have a tombstone for the same item, keep the newer one.
 */
export function mergeTombstones(
  local: Record<string, Tombstone>,
  remote: Record<string, Tombstone>
): Record<string, Tombstone> {
  const merged: Record<string, Tombstone> = { ...local };

  for (const [itemId, remoteTombstone] of Object.entries(remote)) {
    const localTombstone = merged[itemId];
    if (!localTombstone) {
      merged[itemId] = remoteTombstone;
    } else {
      // Keep the newer tombstone
      const localDate = new Date(localTombstone.deletedAt);
      const remoteDate = new Date(remoteTombstone.deletedAt);
      if (remoteDate > localDate) {
        merged[itemId] = remoteTombstone;
      }
    }
  }

  return merged;
}

/**
 * Check if an item is tombstoned (deleted).
 */
export function isItemTombstoned(itemId: string, tombstones: Record<string, Tombstone>): boolean {
  return itemId in tombstones;
}

/**
 * Get items that need to be deleted locally based on remote tombstones.
 * Returns item IDs that exist locally but are tombstoned remotely.
 */
export function getItemsToDelete(
  localItemIds: string[],
  remoteTombstones: Record<string, Tombstone>
): string[] {
  return localItemIds.filter((id) => id in remoteTombstones);
}

/**
 * Detect locally deleted items by comparing current items with previous state.
 * Returns item IDs that existed before but no longer exist.
 */
export function detectLocalDeletions(
  currentItemIds: Set<string>,
  previousItemIds: Set<string>
): string[] {
  const deletions: string[] = [];
  for (const itemId of previousItemIds) {
    if (!currentItemIds.has(itemId)) {
      deletions.push(itemId);
    }
  }
  return deletions;
}

/**
 * Remove items from category info that have tombstones.
 * This ensures tombstoned items aren't included in the live items.
 */
export function removeItemsWithTombstones(
  items: Record<string, unknown>,
  tombstones: Record<string, Tombstone>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [itemId, item] of Object.entries(items)) {
    if (!(itemId in tombstones)) {
      result[itemId] = item;
    }
  }
  return result;
}

// ============================================================================
// TombstonesFile Handling (Schema 4.0)
// ============================================================================

/**
 * Parse a tombstones.json file content.
 * Returns empty tombstones file if content is null or invalid.
 */
export function parseTombstonesFile(content: string | null): TombstonesFile {
  if (!content) {
    return createEmptyTombstonesFile();
  }
  try {
    const parsed: unknown = JSON.parse(content);
    // Validate structure (runtime check for malformed data)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('tombstones' in parsed) ||
      typeof (parsed as { tombstones: unknown }).tombstones !== 'object'
    ) {
      return createEmptyTombstonesFile();
    }
    return parsed as TombstonesFile;
  } catch {
    return createEmptyTombstonesFile();
  }
}

/**
 * Serialize a tombstones file to JSON string.
 */
export function serializeTombstonesFile(file: TombstonesFile): string {
  return JSON.stringify(file, null, 2);
}

/**
 * Get tombstones for a specific category from the tombstones file.
 */
export function getCategoryTombstones(
  file: TombstonesFile,
  category: SyncCategory
): Record<string, Tombstone> {
  return file.tombstones[category] ?? {};
}

/**
 * Set tombstones for a specific category in the tombstones file.
 * Returns a new TombstonesFile (immutable).
 */
export function setCategoryTombstones(
  file: TombstonesFile,
  category: SyncCategory,
  tombstones: Record<string, Tombstone>
): TombstonesFile {
  return {
    ...file,
    tombstones: {
      ...file.tombstones,
      [category]: tombstones,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add a tombstone for a specific item in a category.
 * Returns a new TombstonesFile (immutable).
 */
export function addTombstone(
  file: TombstonesFile,
  category: SyncCategory,
  tombstone: Tombstone
): TombstonesFile {
  const categoryTombstones = getCategoryTombstones(file, category);
  return setCategoryTombstones(file, category, {
    ...categoryTombstones,
    [tombstone.itemId]: tombstone,
  });
}

/**
 * Merge two tombstones files.
 * For each category, merges tombstones using the standard merge logic.
 */
export function mergeTombstonesFiles(
  local: TombstonesFile,
  remote: TombstonesFile
): TombstonesFile {
  const allCategories = new Set([
    ...Object.keys(local.tombstones),
    ...Object.keys(remote.tombstones),
  ]) as Set<SyncCategory>;

  const merged: TombstonesFile = {
    schemaVersion: '1.0',
    tombstones: {},
    updatedAt: new Date().toISOString(),
  };

  for (const category of allCategories) {
    const localTombstones = local.tombstones[category] ?? {};
    const remoteTombstones = remote.tombstones[category] ?? {};
    merged.tombstones[category] = mergeTombstones(localTombstones, remoteTombstones);
  }

  return merged;
}

/**
 * Filter expired tombstones from all categories in a tombstones file.
 * Returns the cleaned file and a map of expired item IDs per category.
 */
export function filterExpiredTombstonesFile(
  file: TombstonesFile,
  now: Date = new Date()
): { cleaned: TombstonesFile; expiredByCategory: Partial<Record<SyncCategory, string[]>> } {
  const cleaned: TombstonesFile = {
    schemaVersion: '1.0',
    tombstones: {},
    updatedAt: file.updatedAt,
  };
  const expiredByCategory: Partial<Record<SyncCategory, string[]>> = {};

  for (const [category, tombstones] of Object.entries(file.tombstones)) {
    const { valid, expiredIds } = filterExpiredTombstones(tombstones, now);
    cleaned.tombstones[category as SyncCategory] = valid;
    if (expiredIds.length > 0) {
      expiredByCategory[category as SyncCategory] = expiredIds;
    }
  }

  return { cleaned, expiredByCategory };
}
