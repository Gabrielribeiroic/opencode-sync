/** Push Operation - Pushes local data to remote storage. */
import { packCategory, calculateChecksum } from '../packer.js';
import { packItem, buildItemInfo, diffItems } from '../item-packer.js';
import {
  maybeEncrypt,
  processTombstonesForPush,
  removeItemsById,
  addSyncHistory,
  markOrphanedFiles,
  buildPushContext,
} from './helpers.js';
import { writeShardedCategory } from './sharding.js';
import {
  type ItemCategoryInfo,
  type ItemInfo,
  type CategoryInfo,
  type ShardedCategoryRef,
} from '../../types/index.js';
import type { Tombstone } from '../../types/manifest.js';
import type {
  CategoryData,
  ItemCategoryData,
  PushContext,
  Manifest,
  SyncCategory,
  PreparePushOptions,
} from './types.js';
import { isBlobCategoryData, isItemCategoryData } from './types.js';

/** Manifest category entry type (includes sharded refs) */
type ManifestCategoryEntry = CategoryInfo | ShardedCategoryRef;

/** Local type guard for item category info (excludes sharded refs) */
function isItemCatInfo(info: ManifestCategoryEntry): info is ItemCategoryInfo {
  return info.type === 'items';
}

/** Result of preparing push data */
export interface PreparePushResult {
  files: Record<string, { content: string | null }>;
  manifest: Manifest;
  changedCategories: SyncCategory[];
}

/** Prepare all data for pushing to remote. */
export function preparePushData(opts: PreparePushOptions): PreparePushResult {
  const { localData, config, localState, passphrase, existingFiles, remoteManifest } = opts;
  const ctx = buildPushContext(config, localState, passphrase);
  const newFiles = new Set<string>();
  const changedCategories: SyncCategory[] = [];

  for (const catData of localData) {
    if (!config.sync[catData.category]) continue;
    const filenames = packCategoryData(catData, remoteManifest, ctx);
    for (const f of filenames) newFiles.add(f);
    changedCategories.push(catData.category);
  }

  markOrphanedFiles(ctx.files, existingFiles, newFiles);
  addSyncHistory(ctx, changedCategories);
  return { files: ctx.files, manifest: ctx.manifest, changedCategories };
}

/** Extract remote item category data if available */
function getRemoteItemData(
  remoteManifest: Manifest | undefined,
  category: SyncCategory
): { items: Record<string, ItemInfo>; tombstones: Record<string, Tombstone> } {
  const info = remoteManifest?.categories[category];
  if (info?.type === 'items') {
    return { items: info.items, tombstones: info.tombstones };
  }
  return { items: {}, tombstones: {} };
}

/** Pack category data based on type (blob or items) */
function packCategoryData(
  catData: CategoryData,
  remoteManifest: Manifest | undefined,
  ctx: PushContext
): string[] {
  if (isItemCategoryData(catData)) {
    const { items, tombstones } = getRemoteItemData(remoteManifest, catData.category);
    return packItemCategoryData(catData, items, ctx, tombstones);
  }
  if (isBlobCategoryData(catData)) {
    return packBlobCategoryData(catData.category, catData.data, ctx);
  }
  return [];
}

/**
 * Pack blob-based category data (legacy approach).
 * Returns list of filenames created.
 */
function packBlobCategoryData(category: SyncCategory, data: string, ctx: PushContext): string[] {
  const dataToStore = maybeEncrypt(category, data, ctx.passphrase);
  const packed = packCategory(category, dataToStore);

  for (const chunk of packed.chunks) {
    ctx.files[chunk.filename] = { content: chunk.content };
  }

  ctx.manifest.categories[category] = {
    type: 'blob',
    files: packed.chunks.map((c) => c.filename),
    totalSize: packed.totalSize,
    compressedSize: packed.compressedSize,
    checksum: packed.checksum,
    lastModified: ctx.now,
    lastModifiedBy: ctx.machineId,
    vectorClock: { [ctx.machineId]: ctx.newClock[ctx.machineId] ?? 1 },
  };

  return packed.chunks.map((c) => c.filename);
}

/** Result of processing items for push */
interface ProcessedItems {
  newItems: Record<string, ItemInfo>;
  filenames: string[];
}

/** Upload changed items and build updated items map */
function processItemsForUpload(
  catData: ItemCategoryData,
  remoteItems: Record<string, ItemInfo>,
  ctx: PushContext
): ProcessedItems {
  const { category, items, checksums } = catData;
  const diff = diffItems(checksums, remoteItems);
  const filenames: string[] = [];
  const newItems: Record<string, ItemInfo> = { ...remoteItems };

  for (const itemId of diff.toUpload) {
    const content = items[itemId];
    if (!content) continue;
    const packed = packItem(category, itemId, content, ctx.machineId);
    ctx.files[packed.filename] = { content: packed.content };
    newItems[itemId] = buildItemInfo(packed, ctx.machineId);
    filenames.push(packed.filename);
  }

  // Keep unchanged items' filenames
  for (const itemId of diff.unchanged) {
    const info = remoteItems[itemId];
    if (info) filenames.push(info.filename);
  }

  return { newItems, filenames };
}

/**
 * Pack per-item category data (sessions, messages).
 * Only uploads items that have changed. Uses sharding when item count exceeds threshold.
 */
function packItemCategoryData(
  catData: ItemCategoryData,
  remoteItems: Record<string, ItemInfo>,
  ctx: PushContext,
  remoteTombstones: Record<string, Tombstone> = {}
): string[] {
  const { category, tombstones: localTombstones } = catData;
  const { newItems: processed, filenames } = processItemsForUpload(catData, remoteItems, ctx);

  // Process tombstones and remove deleted items
  const tombResult = processTombstonesForPush(localTombstones, remoteTombstones, remoteItems);
  for (const filename of tombResult.filesToDelete) {
    ctx.files[filename] = { content: null };
  }
  const newItems = removeItemsById(processed, tombResult.itemsToRemove);

  // Always use sharding for item categories
  const shardFile = writeShardedCategory(category, newItems, tombResult.tombstones, ctx);

  // Return both item filenames AND the shard file to prevent orphan deletion
  return [...filenames, shardFile];
}

/**
 * Check if local data needs pushing by comparing checksums.
 * For sharded categories (sessions, messages), we skip checksum comparison
 * since we don't have the shard content loaded. These rely on vector clock comparison.
 */
export function needsPush(localData: CategoryData[], remoteManifest: Manifest | null): boolean {
  if (!remoteManifest) return true;

  for (const catData of localData) {
    const remoteInfo = remoteManifest.categories[catData.category];

    if (isItemCategoryData(catData)) {
      // Per-item comparison - but only if remote is also items type (not sharded)
      if (!remoteInfo) return true;
      // Skip comparison for sharded categories - they use vector clock comparison
      if (remoteInfo.type === 'sharded') continue;
      if (!isItemCatInfo(remoteInfo)) return true;
      const diff = diffItems(catData.checksums, remoteInfo.items);
      if (diff.toUpload.length > 0) return true;
    } else if (isBlobCategoryData(catData)) {
      // Blob comparison
      const localChecksum = calculateChecksum(catData.data);
      if (!remoteInfo || !('checksum' in remoteInfo)) return true;
      if (localChecksum !== remoteInfo.checksum) return true;
    }
  }

  return false;
}
