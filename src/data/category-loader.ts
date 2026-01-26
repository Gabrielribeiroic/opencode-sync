/**
 * Category Loader
 *
 * Load data for sync categories.
 * All categories use per-item (tree-indexed) loading - each file synced individually.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { SyncCategory, PathConfig, SyncConfig } from '../types/index.js';
import type { LocalSyncState } from '../types/sync.js';
import type { Tombstone } from '../types/manifest.js';
import { getCategoryPaths } from '../types/paths.js';
import type { CategoryData, ItemCategoryData } from '../sync/operations/types.js';
import { calculateChecksum } from '../sync/item-packer.js';
import { createTombstone, detectLocalDeletions } from '../sync/tombstone.js';

export interface LoadedData {
  categories: CategoryData[];
  errors: LoadError[];
}

export interface LoadError {
  category: SyncCategory;
  path: string;
  error: Error;
}

export interface LoadOptions {
  /** Previous local state for deletion detection */
  localState?: LocalSyncState | null;
  /** Machine ID for tombstone creation */
  machineId?: string;
  /** Tombstone grace period in days (default: 30) */
  tombstoneGraceDays?: number;
}

/**
 * Load all data for enabled categories.
 */
export async function loadLocalData(
  pathConfig: PathConfig,
  enabledCategories: SyncConfig['sync'],
  options: LoadOptions = {}
): Promise<LoadedData> {
  const categoryPaths = getCategoryPaths(pathConfig);
  const categories: CategoryData[] = [];
  const errors: LoadError[] = [];

  for (const [category, paths] of Object.entries(categoryPaths)) {
    if (!enabledCategories[category as SyncCategory]) continue;

    try {
      const data = await loadItemCategoryData(category as SyncCategory, paths, options);
      if (data) categories.push(data);
    } catch (error) {
      const firstPath = paths[0];
      if (firstPath !== undefined) {
        errors.push({
          category: category as SyncCategory,
          path: firstPath,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }

  return { categories, errors };
}

/**
 * Load per-item category data.
 * Each file is loaded as a separate item with its own checksum.
 * Also detects locally deleted items and creates tombstones for them.
 */
async function loadItemCategoryData(
  category: SyncCategory,
  paths: string[],
  options: LoadOptions
): Promise<ItemCategoryData | null> {
  const items: Record<string, string> = {};
  const checksums: Record<string, string> = {};

  for (const basePath of paths) {
    await loadItemsFromPath(basePath, '', items, checksums);
  }

  // Detect locally deleted items by comparing with previous state
  const tombstones: Record<string, Tombstone> = {};
  const { localState, machineId, tombstoneGraceDays } = options;
  const prevChecksums = localState?.itemChecksums;
  const prevCategoryChecksums = prevChecksums ? prevChecksums[category] : undefined;
  if (prevCategoryChecksums && machineId) {
    const previousItemIds = new Set(Object.keys(prevCategoryChecksums));
    const currentItemIds = new Set(Object.keys(items));
    const deletedIds = detectLocalDeletions(currentItemIds, previousItemIds);

    for (const itemId of deletedIds) {
      tombstones[itemId] = createTombstone(itemId, machineId, tombstoneGraceDays);
    }
  }

  // Return null only if no items AND no tombstones
  if (Object.keys(items).length === 0 && Object.keys(tombstones).length === 0) {
    return null;
  }

  const result: ItemCategoryData = { category, type: 'items', items, checksums };
  if (Object.keys(tombstones).length > 0) {
    result.tombstones = tombstones;
  }
  return result;
}

/**
 * Recursively load items from a path.
 * @param basePath - The base path being scanned
 * @param relativePath - Current relative path from basePath
 * @param items - Map to populate with item content
 * @param checksums - Map to populate with item checksums
 */
async function loadItemsFromPath(
  basePath: string,
  relativePath: string,
  items: Record<string, string>,
  checksums: Record<string, string>
): Promise<void> {
  const fullPath = relativePath ? join(basePath, relativePath) : basePath;

  try {
    const stats = await stat(fullPath);

    if (stats.isFile()) {
      // Load file as an item
      const content = await readFile(fullPath, 'utf-8');
      const itemId = getItemId(basePath, relativePath);
      items[itemId] = content;
      checksums[itemId] = calculateChecksum(content);
    } else if (stats.isDirectory()) {
      // Recurse into directory
      const entries = await readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files
        const childRelPath = relativePath ? join(relativePath, entry.name) : entry.name;
        await loadItemsFromPath(basePath, childRelPath, items, checksums);
      }
    }
  } catch {
    // Path doesn't exist - skip
  }
}

/**
 * Generate a unique item ID from base path and relative path.
 * Example: basePath=/data/storage/session, relativePath=abc123.json → session/abc123.json
 */
function getItemId(basePath: string, relativePath: string): string {
  const baseDir = basename(basePath);
  if (!relativePath) return baseDir;
  return `${baseDir}/${relativePath}`;
}
