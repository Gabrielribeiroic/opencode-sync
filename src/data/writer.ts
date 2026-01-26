/**
 * Data Writer
 *
 * Writes synced data back to local filesystem.
 * All categories use per-item writes.
 */

import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { PathConfig, SyncCategory } from '../types/index.js';
import { getCategoryPaths } from '../types/paths.js';
import type { CategoryData, ItemCategoryData } from '../sync/operations/types.js';

/**
 * Write synced data back to local filesystem.
 * All categories use per-item writes.
 */
export async function writeLocalData(
  pathConfig: PathConfig,
  categories: CategoryData[]
): Promise<void> {
  const categoryPaths = getCategoryPaths(pathConfig);

  for (const catData of categories) {
    const paths = categoryPaths[catData.category];
    if (paths.length === 0) continue;

    // Per-item write
    await writeItemCategoryData(catData.category, paths, catData);
  }
}

/**
 * Write per-item category data to filesystem (merges).
 * Only writes new items that were pulled from remote.
 */
async function writeItemCategoryData(
  _category: SyncCategory,
  paths: string[],
  catData: ItemCategoryData
): Promise<void> {
  // Find the base directory for this category
  const basePath = paths[0];
  if (!basePath) return;

  // Each item ID is like "session/abc123.json" or "message/xyz/msg.json"
  // We need to write to the appropriate location
  for (const [itemId, content] of Object.entries(catData.items)) {
    const targetPath = resolveItemPath(basePath, itemId);
    await writeItemFile(targetPath, content);
  }
}

/**
 * Resolve the full filesystem path for an item.
 * Item IDs are like "session/abc123.json" → basePath + abc123.json
 * Or "message/session_id/msg.json" → basePath + session_id/msg.json
 */
function resolveItemPath(basePath: string, itemId: string): string {
  // Item ID format: "basedir/relative/path.json"
  // We need to strip the first segment (which matches basePath's basename)
  const parts = itemId.split('/');
  parts.shift(); // Remove the first segment (e.g., "session" or "message")
  const relativePath = parts.join('/');
  return join(basePath, relativePath);
}

/**
 * Write a single item file.
 */
async function writeItemFile(filePath: string, content: string): Promise<void> {
  try {
    await ensureParentDir(filePath);
    await writeFile(filePath, content, 'utf-8');
  } catch (error) {
    console.error(`Failed to write item ${filePath}:`, error);
  }
}

/**
 * Ensure parent directory exists.
 */
async function ensureParentDir(filePath: string): Promise<void> {
  const parentDir = dirname(filePath);
  if (parentDir) {
    await mkdir(parentDir, { recursive: true });
  }
}

/**
 * Delete tombstoned items from local filesystem.
 * Called after pull when remote has tombstones for items that should be deleted locally.
 */
export async function deleteTombstonedItems(
  pathConfig: PathConfig,
  tombstonedItems: Partial<Record<SyncCategory, string[]>>
): Promise<void> {
  const categoryPaths = getCategoryPaths(pathConfig);

  for (const [category, itemIds] of Object.entries(tombstonedItems)) {
    const paths = categoryPaths[category as SyncCategory];
    const basePath = paths[0];
    if (!basePath) continue;

    for (const itemId of itemIds) {
      const targetPath = resolveItemPath(basePath, itemId);
      await deleteItemFile(targetPath);
    }
  }
}

/**
 * Delete a single item file (silently ignores if not found).
 */
async function deleteItemFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    // ENOENT = file doesn't exist, which is fine
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to delete item ${filePath}:`, error);
    }
  }
}
