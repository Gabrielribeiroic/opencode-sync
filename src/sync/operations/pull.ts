/**
 * Pull Operation
 *
 * Handles pulling remote data from storage to local.
 * All categories use tree-indexed sync.
 */

import { unpackItem } from '../item-packer.js';
import { syncLog } from '../engine/logger.js';
import type { StorageBackend, StorageFile } from '../../storage/index.js';
import type { SyncCategory } from '../../types/index.js';
import type { Tombstone, TreeIndexedCategoryInfo } from '../../types/manifest.js';
import { TOMBSTONES_FILENAME } from '../../types/manifest.js';
import { parseTombstonesFile, getCategoryTombstones } from '../tombstone.js';
import { getItemIdFromFilename } from '../item-packer.js';
import type {
  CategoryData,
  ItemCategoryData,
  PullResult,
  Manifest,
  PassphraseOption,
} from './types.js';

/** Options for pull operation */
export interface PullOptions {
  manifest: Manifest;
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
  /** Items that were downloaded */
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

/** Info about a file to fetch */
interface FetchInfo {
  itemId: string;
  filename: string;
  checksum: string;
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

/** Build list of files to fetch, excluding tombstoned items */
function buildFilesToFetch(
  categoryFiles: StorageFile[],
  categoryTombstones: Record<string, Tombstone>
): FetchInfo[] {
  const filesToFetch: FetchInfo[] = [];
  for (const file of categoryFiles) {
    const itemId = getItemIdFromFilename(file.filename);
    if (!itemId) continue;
    if (itemId in categoryTombstones) continue;
    filesToFetch.push({
      itemId,
      filename: file.filename,
      checksum: file.sha ?? '',
    });
  }
  return filesToFetch;
}

/** Process downloaded file contents into items and checksums */
function processDownloadedFiles(
  filesToFetch: FetchInfo[],
  contents: Record<string, string | null>
): { items: Record<string, string>; checksums: Record<string, string> } {
  const items: Record<string, string> = {};
  const checksums: Record<string, string> = {};

  for (const { itemId, filename } of filesToFetch) {
    const content = contents[filename];
    if (!content) continue;

    try {
      const unpacked = unpackItem(filename, content);
      items[itemId] = unpacked.content;
      checksums[itemId] = unpacked.checksum;
    } catch (error) {
      syncLog(`[PULL] Failed to unpack ${itemId}: ${String(error)}`);
    }
  }

  return { items, checksums };
}

export async function pullCategories(options: PullOptions): Promise<ExtendedPullResult> {
  const { manifest, enabledCategories, backend, localChecksums } = options;
  const acc = createPullAccumulator();

  for (const [category, info] of Object.entries(manifest.categories)) {
    const cat = category as SyncCategory;
    if (!enabledCategories[cat]) {
      syncLog(`[PULL] Skipping disabled category: ${cat}`);
      continue;
    }
    syncLog(`[PULL] Processing ${cat} (type: ${info.type})`);
    await pullTreeIndexedCategory(cat, info, localChecksums?.[cat] ?? {}, backend, acc);
  }

  return acc;
}

/**
 * Pull a tree-indexed category using Tree API as source of truth.
 */
async function pullTreeIndexedCategory(
  cat: SyncCategory,
  info: TreeIndexedCategoryInfo,
  _localChecksums: Record<string, string>,
  backend: StorageBackend,
  acc: PullAccumulator
): Promise<void> {
  syncLog(`[PULL] Tree-indexed category ${cat} (pathPrefix: ${info.pathPrefix})`);

  // List remote files and filter by category
  const allFiles = await backend.listFiles();
  const categoryFiles = allFiles.filter((f) => f.filename.startsWith(info.pathPrefix));
  syncLog(`[PULL] ${cat}: found ${String(categoryFiles.length)} files in tree`);

  if (categoryFiles.length === 0) return;

  // Load tombstones from separate file
  const tombstonesContent = await backend.getFile(TOMBSTONES_FILENAME);
  const tombstonesFile = parseTombstonesFile(tombstonesContent);
  const categoryTombstones = getCategoryTombstones(tombstonesFile, cat);
  syncLog(`[PULL] ${cat}: ${String(Object.keys(categoryTombstones).length)} tombstones`);

  // Build list of files to download (excluding tombstoned items)
  const filesToFetch = buildFilesToFetch(categoryFiles, categoryTombstones);

  if (filesToFetch.length === 0) {
    if (Object.keys(categoryTombstones).length > 0) {
      acc.tombstonedItems[cat] = categoryTombstones;
    }
    return;
  }

  // Bulk download and process files
  const contents = await backend.getFiles(filesToFetch.map((f) => f.filename));
  const { items, checksums } = processDownloadedFiles(filesToFetch, contents);
  syncLog(
    `[PULL] ${cat}: downloaded ${String(Object.keys(items).length)}/${String(filesToFetch.length)} items`
  );

  // Record results
  const data: ItemCategoryData = { category: cat, type: 'items', items, checksums };
  recordItemPull(acc, cat, data, categoryTombstones);
}
