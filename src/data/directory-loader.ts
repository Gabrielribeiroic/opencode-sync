/**
 * Directory Loader
 *
 * Load directory contents recursively.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFileContent } from './parsers.js';

/**
 * Load a single path (file or directory).
 */
export async function loadSinglePath(basePath: string): Promise<unknown> {
  try {
    const stats = await stat(basePath);
    if (stats.isFile()) {
      return await loadFileContent(basePath);
    }
    if (stats.isDirectory()) {
      const dirData = await loadDirectory(basePath);
      return Object.keys(dirData).length > 0 ? dirData : null;
    }
  } catch {
    // Path doesn't exist - skip
  }
  return null;
}

/**
 * Load file content.
 */
async function loadFileContent(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, 'utf-8');
  return parseFileContent(filePath, content);
}

/**
 * Recursively load a directory's contents.
 */
async function loadDirectory(dirPath: string): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkipEntry(entry.name)) continue;
      const entryData = await loadDirEntry(dirPath, entry);
      if (entryData !== null) result[entry.name] = entryData;
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return result;
}

/**
 * Check if entry should be skipped.
 */
function shouldSkipEntry(name: string): boolean {
  return name.startsWith('.') && name !== '.opencode';
}

/**
 * Load a single directory entry.
 */
async function loadDirEntry(
  dirPath: string,
  entry: { name: string; isFile: () => boolean; isDirectory: () => boolean }
): Promise<unknown> {
  const fullPath = join(dirPath, entry.name);

  if (entry.isFile()) {
    try {
      return await loadFileContent(fullPath);
    } catch {
      return null;
    }
  }

  if (entry.isDirectory()) {
    const subDir = await loadDirectory(fullPath);
    return Object.keys(subDir).length > 0 ? subDir : null;
  }

  return null;
}

/**
 * Get a normalized key for a path.
 */
export function getPathKey(fullPath: string): string {
  const parts = fullPath.split('/');
  const lastPart = parts[parts.length - 1];
  return lastPart ?? fullPath;
}
