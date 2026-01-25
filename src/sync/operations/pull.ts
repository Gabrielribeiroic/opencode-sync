/**
 * Pull Operation
 *
 * Handles pulling remote data from storage to local.
 * Supports both blob-based sync and per-item merge-based sync.
 */

import { unpackCategory } from '../packer.js';
import { unpackItem, diffItems } from '../item-packer.js';
import { maybeDecrypt } from './helpers.js';
import { fetchCategoryShard } from '../engine/manifest.js';
import type { StorageBackend } from '../../storage/index.js';
import type { PackedChunk, BlobCategoryInfo, ItemInfo, SyncCategory } from '../../types/index.js';
import type { ItemCategoryInfo, Tombstone, ShardedCategoryRef } from '../../types/manifest.js';
import type {
  CategoryData,
  ItemCategoryData,
  StorageFiles,
  PullResult,
  Manifest,
  PassphraseOption,
} from './types.js';

/** Options for pull operation */
export interface PullOptions {
  manifest: Manifest;
  storageFiles: StorageFiles;
  enabledCategories: Record<SyncCategory, boolean>;
  passphrase: PassphraseOption;
  backend: StorageBackend;
  /** Map of category → item ID → checksum for existing local items */
  localChecksums?: Record<SyncCategory, Record<string, string>>;
}

/**
 * Extended pull result with per-item details.
 */
export interface ExtendedPullResult extends PullResult {
  /** Items that were downloaded (for per-item categories) */
  downloadedItems: Record<SyncCategory, string[]>;
  /** Items that should be deleted locally (tombstoned remotely) */
  tombstonedItems: Record<SyncCategory, Record<string, Tombstone>>;
}

/** Result accumulator for pull operation */
interface PullAccumulator {
  pulledData: CategoryData[];
  changedCategories: SyncCategory[];
  downloadedItems: Record<SyncCategory, string[]>;
  tombstonedItems: Record<SyncCategory, Record<string, Tombstone>>;
}

/** Create empty pull accumulator */
function createPullAccumulator(): PullAccumulator {
  return {
    pulledData: [],
    changedCategories: [],
    downloadedItems: {} as Record<SyncCategory, string[]>,
    tombstonedItems: {} as Record<SyncCategory, Record<string, Tombstone>>,
  };
}

/** Record pulled item data in accumulator */
function recordItemPull(
  acc: PullAccumulator,
  cat: SyncCategory,
  data: ItemCategoryData,
  tombstones: Record<string, Tombstone>
): void {
  if (Object.keys(data.items).length > 0) {
    acc.pulledData.push(data);
    acc.changedCategories.push(cat);
    acc.downloadedItems[cat] = Object.keys(data.items);
  }
  if (Object.keys(tombstones).length > 0) {
    acc.tombstonedItems[cat] = tombstones;
  }
}

export async function pullCategories(options: PullOptions): Promise<ExtendedPullResult> {
  const { manifest, storageFiles, enabledCategories, passphrase, backend, localChecksums } =
    options;
  const acc = createPullAccumulator();

  for (const [category, info] of Object.entries(manifest.categories)) {
    const cat = category as SyncCategory;
    if (!enabledCategories[cat]) continue;

    if (info.type === 'items') {
      const data = await pullItemCategory(cat, info, localChecksums?.[cat] ?? {}, backend);
      recordItemPull(acc, cat, data, info.tombstones);
    } else if (info.type === 'sharded') {
      await pullShardedCategoryToAcc(cat, info, localChecksums?.[cat] ?? {}, backend, acc);
    } else {
      // info.type === 'blob'
      const data = await pullBlobCategory(category, info, storageFiles, passphrase, backend);
      acc.pulledData.push({ category: cat, type: 'blob', data });
      acc.changedCategories.push(cat);
    }
  }

  return acc;
}

/** Pull a sharded category and record results in accumulator */
async function pullShardedCategoryToAcc(
  cat: SyncCategory,
  ref: ShardedCategoryRef,
  localChecksums: Record<string, string>,
  backend: StorageBackend,
  acc: PullAccumulator
): Promise<void> {
  const shard = await fetchCategoryShard(backend, ref.shardFile);
  if (!shard) return;

  // Convert shard to ItemCategoryInfo-like structure for pullItemCategory
  const info: ItemCategoryInfo = {
    type: 'items',
    items: shard.items,
    tombstones: shard.tombstones,
    itemCount: Object.keys(shard.items).length,
    lastModified: ref.lastModified,
    lastModifiedBy: ref.lastModifiedBy,
    vectorClock: ref.vectorClock,
  };

  const data = await pullItemCategory(cat, info, localChecksums, backend);
  recordItemPull(acc, cat, data, shard.tombstones);
}

/**
 * Pull a blob-based category from remote.
 */
async function pullBlobCategory(
  category: string,
  info: BlobCategoryInfo,
  storageFiles: StorageFiles,
  passphrase: PassphraseOption,
  backend: StorageBackend
): Promise<string> {
  const chunks = await downloadChunks(storageFiles, info.files, backend);
  const data = unpackCategory(chunks, info.checksum);

  // Let maybeDecrypt handle credentials - it will detect if data is encrypted
  return maybeDecrypt(category, data, passphrase);
}

/**
 * Pull a per-item category from remote.
 * Only downloads items that don't exist locally (merge-based).
 */
async function pullItemCategory(
  category: SyncCategory,
  info: ItemCategoryInfo,
  localChecksums: Record<string, string>,
  backend: StorageBackend
): Promise<ItemCategoryData> {
  // Diff to find what needs download
  const diff = diffItems(localChecksums, info.items);

  // Filter out tombstoned items - don't download items that are already deleted
  const toDownload = diff.toDownload.filter((id) => !(id in info.tombstones));

  const items: Record<string, string> = {};
  const checksums: Record<string, string> = {};

  // Only download items that are remote-only and not tombstoned
  for (const itemId of toDownload) {
    const itemInfo = info.items[itemId];
    if (!itemInfo) continue;

    try {
      const content = await downloadItem(itemInfo, backend);
      if (content) {
        items[itemId] = content;
        checksums[itemId] = itemInfo.checksum;
      }
    } catch (error) {
      // Log but don't fail entire pull for one item
      console.error(`Failed to download item ${itemId}:`, error);
    }
  }

  return { category, type: 'items', items, checksums };
}

/**
 * Download a single item from storage.
 */
async function downloadItem(itemInfo: ItemInfo, backend: StorageBackend): Promise<string | null> {
  const content = await backend.getFile(itemInfo.filename);
  if (!content) return null;

  const unpacked = unpackItem(itemInfo.filename, content, itemInfo.checksum);
  return unpacked.content;
}

/**
 * Download all chunks for a category.
 */
export async function downloadChunks(
  storageFiles: StorageFiles,
  filenames: string[],
  backend: StorageBackend
): Promise<PackedChunk[]> {
  const chunks: PackedChunk[] = [];

  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];
    if (filename === undefined) continue;

    const chunk = await downloadSingleChunk(storageFiles, filename, i, backend);
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Download a single chunk file.
 */
async function downloadSingleChunk(
  storageFiles: StorageFiles,
  filename: string,
  index: number,
  backend: StorageBackend
): Promise<PackedChunk> {
  const file = storageFiles[filename];

  // Try to use cached content first
  let content = file?.content;

  // If no content, fetch from backend
  content ??= (await backend.getFile(filename)) ?? undefined;

  if (!content) throw new Error(`Empty chunk file: ${filename}`);

  return { index, filename, content, size: content.length };
}
