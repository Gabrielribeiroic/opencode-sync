/**
 * Merge Operation
 *
 * Handles merging local and remote data when conflicts are detected.
 * All categories use per-item (tree-indexed) sync.
 * Tombstones are handled separately via tombstones.json file.
 */

import { mergeTombstones } from '../tombstone.js';
import type { StorageBackend } from '../../storage/index.js';
import type { ConflictInfo } from '../../types/index.js';
import type { Tombstone } from '../../types/manifest.js';
import type {
  CategoryData,
  ItemCategoryData,
  Manifest,
  LocalSyncState,
  PassphraseOption,
} from './types.js';

export interface MergeAllResult {
  mergedData: CategoryData[];
  conflicts: ConflictInfo[];
}

interface MergeContext {
  remoteManifest: Manifest;
  localState: LocalSyncState | null;
  passphrase: PassphraseOption;
  machineId: string;
  backend: StorageBackend;
  /** Remote tombstones per category (loaded from tombstones.json) */
  remoteTombstones?: Partial<Record<string, Record<string, Tombstone>>>;
}

/**
 * Merge all categories with remote data.
 * All categories use per-item sync with tombstone merging.
 */
export function mergeAllCategories(
  localData: CategoryData[],
  context: MergeContext
): MergeAllResult {
  const conflicts: ConflictInfo[] = [];
  const mergedData: CategoryData[] = [];

  for (const item of localData) {
    const result = mergeItemCategory(item, context);
    mergedData.push(result);
  }

  return { mergedData, conflicts };
}

/**
 * Merge a per-item category with remote data.
 * Items use additive merge, but tombstones need to be merged.
 * Items that are tombstoned remotely should be removed from local items.
 */
function mergeItemCategory(item: ItemCategoryData, context: MergeContext): ItemCategoryData {
  const { category, items, checksums, tombstones: localTombstones } = item;
  const remoteInfo = context.remoteManifest.categories[category];

  // No remote info - return as-is
  if (!remoteInfo) {
    return item;
  }

  // Get remote tombstones for this category (from tombstones.json)
  const remoteCategoryTombstones = context.remoteTombstones?.[category] ?? {};

  // Merge tombstones from local and remote
  const mergedTombstones = mergeTombstones(localTombstones ?? {}, remoteCategoryTombstones);

  // Remove items that are tombstoned (either locally or remotely)
  const filteredItems = filterTombstonedItems(items, mergedTombstones);
  const filteredChecksums = filterTombstonedItems(checksums, mergedTombstones);

  const result: ItemCategoryData = {
    category,
    type: 'items',
    items: filteredItems,
    checksums: filteredChecksums,
  };

  if (Object.keys(mergedTombstones).length > 0) {
    result.tombstones = mergedTombstones;
  }

  return result;
}

/** Remove items that have tombstones */
function filterTombstonedItems<T>(
  items: Record<string, T>,
  tombstones: Record<string, Tombstone>
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [id, value] of Object.entries(items)) {
    if (!(id in tombstones)) {
      result[id] = value;
    }
  }
  return result;
}
