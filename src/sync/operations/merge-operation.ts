/**
 * Merge Operation
 *
 * Handles merging local and remote data when conflicts are detected.
 * Currently only supports blob-based categories. Per-item categories
 * use additive merge (no overwrite) which doesn't require conflict resolution.
 */

import { calculateChecksum } from '../packer.js';
import { mergeJson, mergeJsonl } from '../merge/index.js';
import { maybeDecrypt } from './helpers.js';
import { downloadChunks } from './pull.js';
import { unpackCategory } from '../packer.js';
import { mergeTombstones } from '../tombstone.js';
import type { StorageBackend } from '../../storage/index.js';
import type { ConflictInfo, BlobCategoryInfo } from '../../types/index.js';
import type { ItemCategoryInfo, Tombstone } from '../../types/manifest.js';
import type {
  CategoryData,
  BlobCategoryData,
  ItemCategoryData,
  StorageFiles,
  Manifest,
  SyncCategory,
  LocalSyncState,
  PassphraseOption,
} from './types.js';
import { isBlobCategoryData, isItemCategoryData } from './types.js';

/** Local type guard to check if remote category info is blob-based */
function isBlobInfo(info: { type: string }): info is BlobCategoryInfo {
  return info.type === 'blob';
}

/** Local type guard to check if remote category info is item-based */
function isItemInfo(info: { type: string }): info is ItemCategoryInfo {
  return info.type === 'items';
}

/** Safely extract tombstones from item category info */
function getRemoteTombstones(info: ItemCategoryInfo): Record<string, Tombstone> {
  return info.tombstones;
}

export interface MergeAllResult {
  mergedData: CategoryData[];
  conflicts: ConflictInfo[];
}

interface MergeContext {
  remoteManifest: Manifest;
  storageFiles: StorageFiles;
  localState: LocalSyncState | null;
  passphrase: PassphraseOption;
  machineId: string;
  backend: StorageBackend;
}

/**
 * Merge all categories with remote data.
 * Blob categories use three-way merge; per-item categories merge tombstones.
 */
export async function mergeAllCategories(
  localData: CategoryData[],
  context: MergeContext
): Promise<MergeAllResult> {
  const conflicts: ConflictInfo[] = [];
  const mergedData: CategoryData[] = [];

  for (const item of localData) {
    if (isBlobCategoryData(item)) {
      const result = await mergeBlobCategory(item, context, conflicts);
      mergedData.push(result);
    } else if (isItemCategoryData(item)) {
      const result = mergeItemCategory(item, context);
      mergedData.push(result);
    }
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

  // No remote info or not an item category - return as-is
  if (!remoteInfo || !isItemInfo(remoteInfo)) {
    return item;
  }

  // Merge tombstones from local and remote
  const mergedTombstones = mergeTombstones(localTombstones ?? {}, getRemoteTombstones(remoteInfo));

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

/**
 * Merge a blob-based category with remote data.
 */
async function mergeBlobCategory(
  item: BlobCategoryData,
  context: MergeContext,
  conflicts: ConflictInfo[]
): Promise<BlobCategoryData> {
  const { category, data, isJsonl } = item;
  const remoteInfo = context.remoteManifest.categories[category];

  if (!remoteInfo || !isBlobInfo(remoteInfo)) {
    return { category, type: 'blob', data };
  }

  const localChecksum = calculateChecksum(data);
  if (localChecksum === remoteInfo.checksum) {
    return { category, type: 'blob', data };
  }

  const remoteData = await downloadAndDecryptCategory(
    category,
    remoteInfo,
    context.storageFiles,
    context.passphrase,
    context.backend
  );
  const baseData = context.localState?.baseVersions[category];
  const merged = mergeCategory(data, remoteData, baseData, isJsonl);

  if (!merged.success) {
    conflicts.push(createConflictInfo(category, localChecksum, remoteInfo, context.machineId));
  }

  return { category, type: 'blob', data: merged.data, isJsonl: isJsonl ?? false };
}

/**
 * Download and decrypt a category from remote.
 */
async function downloadAndDecryptCategory(
  category: string,
  info: BlobCategoryInfo,
  storageFiles: StorageFiles,
  passphrase: PassphraseOption,
  backend: StorageBackend
): Promise<string> {
  const chunks = await downloadChunks(storageFiles, info.files, backend);
  // Skip checksum validation - blob categories legitimately differ between machines
  // (dev/prod builds, different projects/state)
  const data = unpackCategory(chunks);
  return maybeDecrypt(category, data, passphrase);
}

/**
 * Perform category merge using appropriate strategy.
 */
function mergeCategory(
  local: string,
  remote: string,
  base: string | undefined,
  isJsonl?: boolean
): { success: boolean; data: string } {
  const baseData = base ?? remote;

  if (isJsonl) {
    const result = mergeJsonl(baseData, local, remote);
    return { success: result.success, data: result.merged };
  }

  return mergeJsonData(baseData, local, remote);
}

/**
 * Merge JSON data with three-way merge.
 */
function mergeJsonData(
  baseData: string,
  local: string,
  remote: string
): { success: boolean; data: string } {
  try {
    const baseJson: unknown = JSON.parse(baseData);
    const localJson: unknown = JSON.parse(local);
    const remoteJson: unknown = JSON.parse(remote);
    const result = mergeJson(baseJson, localJson, remoteJson);
    return { success: result.success, data: JSON.stringify(result.merged) };
  } catch {
    return { success: false, data: local };
  }
}

/**
 * Create conflict info object.
 */
function createConflictInfo(
  category: SyncCategory,
  localChecksum: string,
  remoteInfo: BlobCategoryInfo,
  machineId: string
): ConflictInfo {
  return {
    category,
    localChecksum,
    remoteChecksum: remoteInfo.checksum,
    localModifiedBy: machineId,
    remoteModifiedBy: remoteInfo.lastModifiedBy,
    resolution: 'auto-merged',
  };
}
