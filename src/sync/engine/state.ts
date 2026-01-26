/**
 * Sync Engine State Management
 *
 * Handles local state updates after sync operations.
 */

import type { Manifest, LocalSyncState, SyncCategory } from '../../types/index.js';
import type { CategoryData } from '../operations/types.js';

/**
 * Build updated local state after a sync operation.
 * All categories use per-item tracking.
 */
export function buildLocalState(
  manifest: Manifest,
  data: CategoryData[],
  storageId: string,
  machineId: string
): LocalSyncState {
  const now = new Date().toISOString();
  const checksums: LocalSyncState['categoryChecksums'] = {};
  const baseVersions: LocalSyncState['baseVersions'] = {};
  const itemChecksums: Partial<Record<SyncCategory, Record<string, string>>> = {};

  for (const item of data) {
    // All categories: track individual item checksums for deletion detection
    itemChecksums[item.category] = item.checksums;
  }

  return {
    storageId,
    machineId,
    lastSyncedVersion: manifest.version,
    lastSyncedAt: now,
    categoryChecksums: checksums,
    baseVersions,
    itemChecksums,
  };
}

/**
 * Check if another machine has an advisory lock.
 */
export function isLockedByOther(
  manifest: Manifest,
  machineId: string,
  timeoutSeconds: number
): boolean {
  if (!manifest.advisoryLock) return false;
  if (manifest.advisoryLock.machine === machineId) return false;

  const lockTime = new Date(manifest.advisoryLock.since).getTime();
  const timeout = timeoutSeconds * 1000;
  return Date.now() - lockTime < timeout;
}

/** Build a lookup map from category array */
function buildCategoryMap(data: CategoryData[]): Map<SyncCategory, CategoryData> {
  const map = new Map<SyncCategory, CategoryData>();
  for (const item of data) map.set(item.category, item);
  return map;
}

/** Merge item category data (local + pulled) */
function mergeItemData(local: CategoryData, pulled: CategoryData): CategoryData {
  return {
    category: pulled.category,
    type: 'items',
    items: { ...local.items, ...pulled.items },
    checksums: { ...local.checksums, ...pulled.checksums },
  };
}

/** Process a single pulled category, merging with local if needed */
function processPulledCategory(
  pulled: CategoryData,
  localByCategory: Map<SyncCategory, CategoryData>
): CategoryData {
  const local = localByCategory.get(pulled.category);
  if (local) {
    return mergeItemData(local, pulled);
  }
  return pulled;
}

/**
 * Merge local and pulled data for complete state tracking.
 * After a pull, we need to track ALL items (local + pulled) for proper deletion detection.
 */
export function mergeDataForState(
  localData: CategoryData[] | undefined,
  pulledData: CategoryData[]
): CategoryData[] {
  if (!localData) return pulledData;

  const localByCategory = buildCategoryMap(localData);
  const processedCategories = new Set<SyncCategory>();
  const result: CategoryData[] = [];

  // Process pulled data first (it takes precedence for blobs)
  for (const pulled of pulledData) {
    processedCategories.add(pulled.category);
    result.push(processPulledCategory(pulled, localByCategory));
  }

  // Add local-only categories (not in pulled)
  for (const local of localData) {
    if (!processedCategories.has(local.category)) result.push(local);
  }

  return result;
}
