/**
 * Data Writer
 *
 * Writes synced data back to local filesystem.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PathConfig } from '../types/index.js';
import { getCategoryPaths } from '../types/paths.js';
import type { CategoryData } from '../sync/operations/types.js';

/**
 * Write synced data back to local filesystem.
 */
export async function writeLocalData(
  pathConfig: PathConfig,
  categories: CategoryData[]
): Promise<void> {
  const categoryPaths = getCategoryPaths(pathConfig);

  for (const { category, data } of categories) {
    const paths = categoryPaths[category];
    if (paths.length === 0) continue;

    const parsed = JSON.parse(data) as Record<string, unknown>;
    await writeCategoryData(paths, parsed);
  }
}

/**
 * Write category data to filesystem.
 */
async function writeCategoryData(paths: string[], data: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(data)) {
    const targetPath = findTargetPath(paths, key);
    if (targetPath === undefined) continue;
    await writeEntry(targetPath, value);
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
  const parts = filePath.split('/');
  parts.pop();
  const parentDir = parts.join('/');
  if (parentDir) {
    await mkdir(parentDir, { recursive: true });
  }
}
