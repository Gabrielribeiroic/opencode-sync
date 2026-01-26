/**
 * Pull Operation
 *
 * Handles pulling remote data from storage to local.
 * Supports both blob-based sync and per-item merge-based sync.
 */

/* eslint-disable max-lines, max-statements */

import { unpackCategory } from '../packer.js';
import { unpackItem } from '../item-packer.js';
import { maybeDecrypt } from './helpers.js';
import { syncLog } from '../engine/logger.js';
import type { StorageBackend } from '../../storage/index.js';
import type { PackedChunk, BlobCategoryInfo, SyncCategory } from '../../types/index.js';
import type { ItemCategoryInfo, Tombstone, TreeIndexedCategoryInfo } from '../../types/manifest.js';
import { isTreeIndexedCategory, TOMBSTONES_FILENAME } from '../../types/manifest.js';
import { parseTombstonesFile, getCategoryTombstones } from '../tombstone.js';
import { getItemIdFromFilename } from '../item-packer.js';
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
    if (!enabledCategories[cat]) {
      syncLog(`[PULL] Skipping disabled category: ${cat}`);
      continue;
    }
    syncLog(`[PULL] Processing ${cat} (type: ${info.type})`);

    if (info.type === 'items') {
      const data = await pullItemCategory(cat, info, localChecksums?.[cat] ?? {}, backend);
      recordItemPull(acc, cat, data, info.tombstones);
    } else if (isTreeIndexedCategory(info)) {
      await pullTreeIndexedCategoryToAcc(cat, info, localChecksums?.[cat] ?? {}, backend, acc);
    } else {
      // Blob category (info.type === 'blob')
      const data = await pullBlobCategory(category, info, storageFiles, passphrase, backend);
      acc.pulledData.push({ category: cat, type: 'blob', data });
      acc.changedCategories.push(cat);
    }
  }

  return acc;
}

/**
 * Pull a tree-indexed category using Tree API as source of truth.
 *
 * Tree-indexed categories (schema 4.0) don't track per-item metadata in manifest.
 * Instead, we:
 * 1. List all files in the category's directory via Tree API (listFiles)
 * 2. Compare Git SHAs with local checksums to find changes
 * 3. Download only changed/new files via GraphQL batch fetch
 * 4. Load tombstones from separate tombstones.json file
 */
async function pullTreeIndexedCategoryToAcc(
  cat: SyncCategory,
  info: TreeIndexedCategoryInfo,
  _localChecksums: Record<string, string>,
  backend: StorageBackend,
  acc: PullAccumulator
): Promise<void> {
  syncLog(`[PULL] Tree-indexed category ${cat} (pathPrefix: ${info.pathPrefix})`);

  // 1. List all remote files via Tree API
  const allFiles = await backend.listFiles();
  const categoryFiles = allFiles.filter((f) => f.filename.startsWith(info.pathPrefix));
  syncLog(`[PULL] ${cat}: found ${String(categoryFiles.length)} files in tree`);

  if (categoryFiles.length === 0) {
    return;
  }

  // 2. Load tombstones from separate file
  const tombstonesContent = await backend.getFile(TOMBSTONES_FILENAME);
  const tombstonesFile = parseTombstonesFile(tombstonesContent);
  const categoryTombstones = getCategoryTombstones(tombstonesFile, cat);
  syncLog(`[PULL] ${cat}: ${String(Object.keys(categoryTombstones).length)} tombstones`);

  // 3. Build list of files to download (all non-tombstoned items)
  // For tree-indexed, we download all items to ensure local filesystem is in sync
  const filesToFetch: FetchInfo[] = [];
  for (const file of categoryFiles) {
    const itemId = getItemIdFromFilename(file.filename);
    if (!itemId) continue;
    if (itemId in categoryTombstones) continue; // Skip tombstoned items

    filesToFetch.push({
      itemId,
      filename: file.filename,
      // Use Git SHA as checksum proxy (content-addressable)
      checksum: file.sha ?? '',
    });
  }

  if (filesToFetch.length === 0) {
    // Record tombstones even if no files to download
    if (Object.keys(categoryTombstones).length > 0) {
      acc.tombstonedItems[cat] = categoryTombstones;
    }
    return;
  }

  // 4. Bulk download files via GraphQL
  const contents = await backend.getFiles(filesToFetch.map((f) => f.filename));

  // 5. Process downloaded files
  const items: Record<string, string> = {};
  const checksums: Record<string, string> = {};

  for (const { itemId, filename } of filesToFetch) {
    const content = contents[filename];
    if (!content) continue;

    try {
      // For tree-indexed, we skip checksum validation since Git SHA is the authority
      const unpacked = unpackItem(filename, content);
      items[itemId] = unpacked.content;
      checksums[itemId] = unpacked.checksum; // Use computed checksum for local state
    } catch (error) {
      syncLog(`[PULL] Failed to unpack ${itemId}: ${String(error)}`);
    }
  }

  syncLog(
    `[PULL] ${cat}: downloaded ${String(Object.keys(items).length)}/${String(filesToFetch.length)} items`
  );

  // 6. Record results
  const data: ItemCategoryData = { category: cat, type: 'items', items, checksums };
  recordItemPull(acc, cat, data, categoryTombstones);
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
  // Skip checksum validation - blob categories legitimately differ between machines
  // (dev/prod builds, different projects/state)
  const data = unpackCategory(chunks);

  // Let maybeDecrypt handle credentials - it will detect if data is encrypted
  return maybeDecrypt(category, data, passphrase);
}

/** Info about a file to fetch */
interface FetchInfo {
  itemId: string;
  filename: string;
  checksum: string;
}

/** Build list of files that need to be fetched */
function buildFetchList(
  toDownload: string[],
  itemsInfo: Record<string, { filename: string; checksum: string }>
): FetchInfo[] {
  const list: FetchInfo[] = [];
  for (const itemId of toDownload) {
    const info = itemsInfo[itemId];
    if (info) list.push({ itemId, filename: info.filename, checksum: info.checksum });
  }
  return list;
}

/** Process fetched content and unpack items */
function processDownloads(
  filesToFetch: FetchInfo[],
  contents: Record<string, string | null>
): { items: Record<string, string>; checksums: Record<string, string> } {
  const items: Record<string, string> = {};
  const checksums: Record<string, string> = {};

  for (const { itemId, filename, checksum } of filesToFetch) {
    const content = contents[filename];
    if (!content) continue;

    try {
      const unpacked = unpackItem(filename, content, checksum);
      items[itemId] = unpacked.content;
      checksums[itemId] = checksum;
    } catch (error) {
      console.error(`Failed to unpack item ${itemId}:`, error);
    }
  }

  return { items, checksums };
}

/**
 * Pull a per-item category from remote.
 * Uses bulk fetch for efficiency (~2 API calls instead of N).
 *
 * Always downloads all items to ensure they exist on disk.
 * TODO: Optimize to only download items missing from filesystem.
 */
async function pullItemCategory(
  category: SyncCategory,
  info: ItemCategoryInfo,
  _localChecksums: Record<string, string>,
  backend: StorageBackend
): Promise<ItemCategoryData> {
  // Download ALL items (not just those with different checksums)
  // to ensure they exist on disk even if state was updated but files weren't written
  const allItemIds = Object.keys(info.items).filter((id) => !(id in info.tombstones));

  if (allItemIds.length === 0) {
    return { category, type: 'items', items: {}, checksums: {} };
  }

  const filesToFetch = buildFetchList(allItemIds, info.items);
  const contents = await backend.getFiles(filesToFetch.map((f) => f.filename));
  const { items, checksums } = processDownloads(filesToFetch, contents);

  syncLog(
    `[PULL] ${category}: downloaded ${String(Object.keys(items).length)}/${String(allItemIds.length)} items`
  );

  return { category, type: 'items', items, checksums };
}

/**
 * Download all chunks for a category.
 * Uses bulk fetch for efficiency.
 */
export async function downloadChunks(
  storageFiles: StorageFiles,
  filenames: string[],
  backend: StorageBackend
): Promise<PackedChunk[]> {
  // Collect filenames that need fetching (not in cache)
  const toFetch: string[] = [];
  for (const filename of filenames) {
    if (filename && !storageFiles[filename]?.content) {
      toFetch.push(filename);
    }
  }

  // Bulk fetch missing files
  const fetched = toFetch.length > 0 ? await backend.getFiles(toFetch) : {};

  // Build chunks array
  const chunks: PackedChunk[] = [];
  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];
    if (filename === undefined) continue;

    // Use cached content or fetched content
    const content = storageFiles[filename]?.content ?? fetched[filename];
    if (!content) throw new Error(`Empty chunk file: ${filename}`);

    chunks.push({ index: i, filename, content, size: content.length });
  }

  return chunks;
}
