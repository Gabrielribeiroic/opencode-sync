/** Push Operation - Pushes local data to remote storage. */

import { packItem, buildItemInfo, diffItems } from '../item-packer.js';
import {
  processTombstonesForPush,
  removeItemsById,
  addSyncHistory,
  markOrphanedFiles,
  buildPushContext,
} from './helpers.js';
import { syncLog } from '../../logging/index.js';
import {
  type ItemInfo,
  type TreeIndexedCategoryInfo,
  TOMBSTONES_FILENAME,
} from '../../types/index.js';
import type { Tombstone } from '../../types/manifest.js';
import {
  parseTombstonesFile,
  serializeTombstonesFile,
  getCategoryTombstones,
  setCategoryTombstones,
  mergeTombstones,
} from '../tombstone.js';
import type {
  CategoryData,
  ItemCategoryData,
  PushContext,
  Manifest,
  SyncCategory,
  PreparePushOptions,
} from './types.js';

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

/** Pack category data (all categories use tree-indexed sync) */
function packCategoryData(
  catData: CategoryData,
  _remoteManifest: Manifest | undefined,
  ctx: PushContext
): string[] {
  // All categories now use tree-indexed sync, no remote item tracking needed
  return packItemCategoryData(catData, {}, ctx, {});
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
    syncLog(`[PUSH] ${category}/${itemId}`);
  }

  // Keep unchanged items' filenames
  for (const itemId of diff.unchanged) {
    const info = remoteItems[itemId];
    if (info) filenames.push(info.filename);
  }

  return { newItems, filenames };
}

/**
 * Pack category data using tree-indexed approach.
 * Items stored as individual files, tombstones in separate file.
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

  // Write tree-indexed category reference to manifest
  writeTreeIndexedCategory(category, newItems, tombResult.tombstones, ctx);

  // Return item filenames
  return filenames;
}

/**
 * Write a tree-indexed category to manifest and update tombstones file.
 */
function writeTreeIndexedCategory(
  category: SyncCategory,
  items: Record<string, ItemInfo>,
  tombstones: Record<string, Tombstone>,
  ctx: PushContext
): void {
  const pathPrefix = `${category}/`;

  ctx.manifest.categories[category] = {
    type: 'tree-indexed',
    pathPrefix,
    itemCount: Object.keys(items).length,
    lastModified: ctx.now,
    lastModifiedBy: ctx.machineId,
  } satisfies TreeIndexedCategoryInfo;

  // Merge tombstones into the tombstones file
  if (Object.keys(tombstones).length > 0) {
    const existingContent = ctx.tombstonesFileContent ?? null;
    const existingFile = parseTombstonesFile(existingContent);
    const categoryTombstones = getCategoryTombstones(existingFile, category);
    const mergedTombstones = mergeTombstones(categoryTombstones, tombstones);
    const updatedFile = setCategoryTombstones(existingFile, category, mergedTombstones);
    ctx.tombstonesFileContent = serializeTombstonesFile(updatedFile);
    ctx.files[TOMBSTONES_FILENAME] = { content: ctx.tombstonesFileContent };
  }
}

/**
 * Check if local data needs pushing.
 * Compares local item counts against remote manifest.
 */
export function needsPush(localData: CategoryData[], remoteManifest: Manifest | null): boolean {
  if (!remoteManifest) return true;

  for (const catData of localData) {
    const remoteInfo = remoteManifest.categories[catData.category];
    if (!remoteInfo) return true;

    // Compare item counts - if local has different count, needs push
    const localCount = Object.keys(catData.items).length;
    const remoteCount = remoteInfo.itemCount;
    if (localCount !== remoteCount) return true;

    // Also check for tombstones (deletions)
    if (catData.tombstones && Object.keys(catData.tombstones).length > 0) {
      return true;
    }
  }

  return false;
}
