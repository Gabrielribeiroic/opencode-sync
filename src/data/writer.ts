/**
 * Data Writer
 *
 * Writes synced data back to local filesystem.
 * Supports both blob-based overwrite and per-item merge writes.
 */

import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { PathConfig, SyncCategory } from '../types/index.js';
import { getCategoryPaths } from '../types/paths.js';
import type { CategoryData, ItemCategoryData } from '../sync/operations/types.js';
import { isBlobCategoryData, isItemCategoryData } from '../sync/operations/types.js';

/**
 * Write synced data back to local filesystem.
 * - Blob categories: overwrites local data
 * - Item categories: merges new items (does NOT overwrite existing)
 */
export async function writeLocalData(
  pathConfig: PathConfig,
  categories: CategoryData[]
): Promise<void> {
  const categoryPaths = getCategoryPaths(pathConfig);

  for (const catData of categories) {
    const paths = categoryPaths[catData.category];
    if (paths.length === 0) continue;

    if (isItemCategoryData(catData)) {
      // Per-item merge write
      await writeItemCategoryData(catData.category, paths, catData);
    } else if (isBlobCategoryData(catData)) {
      // Blob overwrite
      const parsed = JSON.parse(catData.data) as Record<string, unknown>;
      await writeBlobCategoryData(paths, parsed);
    }
  }
}

/**
 * Write blob-based category data to filesystem (overwrites).
 */
async function writeBlobCategoryData(
  paths: string[],
  data: Record<string, unknown>
): Promise<void> {
  for (const [key, value] of Object.entries(data)) {
    const targetPath = findTargetPath(paths, key);
    if (targetPath === undefined) continue;
    await writeEntry(targetPath, value);
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
 * Find target path for a key.
 */
function findTargetPath(paths: string[], key: string): string | undefined {
  return paths.find((p) => p.endsWith(key)) ?? paths[0];
}

/**
 * Write a single entry (file or directory).
 */
async function writeEntry(targetPath: string, value: unknown): Promise<void> {
  try {
    if (isDirectoryValue(value)) {
      await mkdir(targetPath, { recursive: true });
      await writeDirectoryData(targetPath, value as Record<string, unknown>);
    } else {
      await ensureParentDir(targetPath);
      const content = serializeContent(targetPath, value);
      await writeFile(targetPath, content, 'utf-8');
    }
  } catch (error) {
    console.error(`Failed to write ${targetPath}:`, error);
  }
}

/**
 * Check if value represents a directory.
 */
function isDirectoryValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Write directory contents recursively.
 */
async function writeDirectoryData(dirPath: string, data: Record<string, unknown>): Promise<void> {
  for (const [name, value] of Object.entries(data)) {
    const fullPath = join(dirPath, name);
    await writeEntry(fullPath, value);
  }
}

/**
 * Serialize content based on file type.
 */
function serializeContent(filePath: string, value: unknown): string {
  if (filePath.endsWith('.json')) {
    return JSON.stringify(value, null, 2);
  }

  if (filePath.endsWith('.jsonl') && Array.isArray(value)) {
    return value.map((item) => JSON.stringify(item)).join('\n');
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
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
