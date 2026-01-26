/**
 * Tombstone utilities for tracking deleted items across machines.
 *
 * Tombstones are deletion markers that propagate across machines during sync.
 * They ensure that when an item is deleted on one machine, it gets deleted
 * on all other machines during the next sync.
 */

import type { Tombstone } from '../types/manifest.js';
import { DEFAULT_TOMBSTONE_GRACE_DAYS } from '../types/manifest.js';

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

// Re-export TombstonesFile functions for backward compatibility
export {
  parseTombstonesFile,
  serializeTombstonesFile,
  getCategoryTombstones,
  setCategoryTombstones,
  addTombstone,
  mergeTombstonesFiles,
  filterExpiredTombstonesFile,
} from './tombstone-file.js';
