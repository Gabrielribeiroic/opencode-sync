/**
 * TombstonesFile Handling (Schema 5.0)
 *
 * Functions for parsing, serializing, and manipulating the tombstones.json file.
 */

import type { Tombstone, TombstonesFile } from '../types/manifest.js';
import type { SyncCategory } from '../types/categories.js';
import { createEmptyTombstonesFile } from '../types/manifest.js';
import { mergeTombstones, filterExpiredTombstones } from './tombstone.js';

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
    if (!isValidTombstonesFile(parsed)) {
      return createEmptyTombstonesFile();
    }
    return parsed as TombstonesFile;
  } catch {
    return createEmptyTombstonesFile();
  }
}

/** Validate structure of parsed tombstones file */
function isValidTombstonesFile(parsed: unknown): boolean {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    'tombstones' in parsed &&
    typeof (parsed as { tombstones: unknown }).tombstones === 'object'
  );
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
