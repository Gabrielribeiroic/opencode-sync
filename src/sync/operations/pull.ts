/**
 * Pull Operation
 *
 * Handles pulling remote data from storage to local.
 * All categories use tree-indexed sync.
 */

import { unpackItem } from '../item-packer.js';
import { syncLog } from '../../logging/index.js';
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
  /** Map of category → filename → git SHA for incremental pull */
  localRemoteShas?: Partial<Record<SyncCategory, Record<string, string>>>;
}

/**
 * Extended pull result with per-item details.
 */
export interface ExtendedPullResult extends PullResult {
  /** Items that were downloaded */
  downloadedItems: Record<SyncCategory, string[]>;
  /** Items that should be deleted locally (tombstoned remotely) */
  tombstonedItems: Record<SyncCategory, Record<string, Tombstone>>;
  /** Remote SHAs for all synced items (for incremental pull) */
  remoteShas: Partial<Record<SyncCategory, Record<string, string>>>;
}

/** Result accumulator for pull operation */
interface PullAccumulator {
  pulledData: CategoryData[];
  changedCategories: SyncCategory[];
  downloadedItems: Record<SyncCategory, string[]>;
  tombstonedItems: Record<SyncCategory, Record<string, Tombstone>>;
  remoteShas: Partial<Record<SyncCategory, Record<string, string>>>;
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
    remoteShas: {},
  };
}

/** Record pulled item data in accumulator */
function recordItemPull(
  acc: PullAccumulator,
  cat: SyncCategory,
  data: ItemCategoryData,
  tombstones: Record<string, Tombstone>,
  shas: Record<string, string>
): void {
  if (Object.keys(data.items).length > 0) {
    acc.pulledData.push(data);
    acc.changedCategories.push(cat);
    acc.downloadedItems[cat] = Object.keys(data.items);
  }
  if (Object.keys(tombstones).length > 0) {
    acc.tombstonedItems[cat] = tombstones;
  }
  // Always record SHAs (merge with existing for incremental)
  acc.remoteShas[cat] = { ...(acc.remoteShas[cat] ?? {}), ...shas };
}

/** Build list of files to fetch, excluding tombstoned and unchanged items */
function buildFilesToFetch(
  categoryFiles: StorageFile[],
  categoryTombstones: Record<string, Tombstone>,
  localShas?: Record<string, string>
): FetchInfo[] {
  const filesToFetch: FetchInfo[] = [];
  let skipped = 0;
  for (const file of categoryFiles) {
    const itemId = getItemIdFromFilename(file.filename);
    if (!itemId) continue;
    if (itemId in categoryTombstones) continue;
    // Skip if local has same SHA (unchanged)
    if (localShas && file.sha && localShas[itemId] === file.sha) {
      skipped++;
      continue;
    }
    filesToFetch.push({
      itemId,
      filename: file.filename,
      checksum: file.sha ?? '',
    });
  }
  if (skipped > 0) {
    syncLog(`[PULL] Skipped ${String(skipped)} unchanged files`);
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
      syncLog(`[PULL] ${filename}`);
    } catch (error) {
      syncLog(`[PULL] Failed to unpack ${itemId}: ${String(error)}`);
    }
  }

  return { items, checksums };
}

/** Build SHA map from fetched files */
function buildShaMap(filesToFetch: FetchInfo[]): Record<string, string> {
  const shas: Record<string, string> = {};
  for (const f of filesToFetch) {
    if (f.checksum) shas[f.itemId] = f.checksum;
  }
  return shas;
}

/** Load tombstones for a category */
async function loadCategoryTombstones(
  backend: StorageBackend,
  cat: SyncCategory
): Promise<Record<string, Tombstone>> {
  const content = await backend.getFile(TOMBSTONES_FILENAME);
  const file = parseTombstonesFile(content);
  return getCategoryTombstones(file, cat);
}

export async function pullCategories(options: PullOptions): Promise<ExtendedPullResult> {
  const { manifest, enabledCategories, backend, localRemoteShas } = options;
  const acc = createPullAccumulator();

  for (const [category, info] of Object.entries(manifest.categories)) {
    const cat = category as SyncCategory;
    if (!enabledCategories[cat]) {
      syncLog(`[PULL] Skipping disabled category: ${cat}`);
      continue;
    }
    syncLog(`[PULL] Processing ${cat} (type: ${info.type})`);
    await pullTreeIndexedCategory(cat, info, localRemoteShas?.[cat], backend, acc);
  }

  return acc;
}

/**
 * Pull a tree-indexed category using Tree API as source of truth.
 */
async function pullTreeIndexedCategory(
  cat: SyncCategory,
  info: TreeIndexedCategoryInfo,
  localShas: Record<string, string> | undefined,
  backend: StorageBackend,
  acc: PullAccumulator
): Promise<void> {
  syncLog(`[PULL] Tree-indexed category ${cat} (pathPrefix: ${info.pathPrefix})`);

  // List remote files and filter by category
  const allFiles = await backend.listFiles();
  const categoryFiles = allFiles.filter((f) => f.filename.startsWith(info.pathPrefix));
  syncLog(`[PULL] ${cat}: found ${String(categoryFiles.length)} files in tree`);
  if (categoryFiles.length === 0) return;

  // Load tombstones and build file list
  const categoryTombstones = await loadCategoryTombstones(backend, cat);
  syncLog(`[PULL] ${cat}: ${String(Object.keys(categoryTombstones).length)} tombstones`);
  const filesToFetch = buildFilesToFetch(categoryFiles, categoryTombstones, localShas);
  syncLog(`[PULL] ${cat}: ${String(filesToFetch.length)} files to fetch`);

  if (filesToFetch.length === 0) {
    if (Object.keys(categoryTombstones).length > 0) acc.tombstonedItems[cat] = categoryTombstones;
    return;
  }

  // Bulk download and process files
  syncLog(`[PULL] ${cat}: starting bulk download...`);
  const contents = await backend.getFiles(filesToFetch.map((f) => f.filename));
  const { items, checksums } = processDownloadedFiles(filesToFetch, contents);
  syncLog(
    `[PULL] ${cat}: downloaded ${String(Object.keys(items).length)}/${String(filesToFetch.length)} items`
  );

  // Record results with SHAs for incremental sync
  const data: ItemCategoryData = { category: cat, type: 'items', items, checksums };
  recordItemPull(acc, cat, data, categoryTombstones, buildShaMap(filesToFetch));
}
