/**
 * Remote Fetch Helpers
 *
 * Functions to fetch remote items during push operations.
 */

import type { StorageBackend } from '../../storage/index.js';
import type { SyncCategory } from '../../types/index.js';
import type { CategoryData, ItemCategoryData, ResolvedShard } from '../operations/types.js';
import { unpackItem } from '../item-packer.js';
import { syncLog } from './logger.js';

/** Info about a remote file to fetch */
interface RemoteFetchInfo {
  category: SyncCategory;
  itemId: string;
  filename: string;
  checksum: string;
}

/** Build a map of local item IDs per category */
function buildLocalItemIdMap(localData: CategoryData[]): Map<SyncCategory, Set<string>> {
  const map = new Map<SyncCategory, Set<string>>();
  for (const cat of localData) {
    if (cat.type === 'items') {
      const set = map.get(cat.category) ?? new Set<string>();
      for (const id of Object.keys(cat.items)) {
        set.add(id);
      }
      map.set(cat.category, set);
    }
  }
  return map;
}

/** Collect files to fetch from shards (excluding local and tombstoned items) */
function collectFilesToFetch(
  shards: Record<SyncCategory, ResolvedShard>,
  localItemIds: Map<SyncCategory, Set<string>>
): RemoteFetchInfo[] {
  const filesToFetch: RemoteFetchInfo[] = [];

  for (const [category, shard] of Object.entries(shards) as [SyncCategory, ResolvedShard][]) {
    const localIds = localItemIds.get(category) ?? new Set<string>();
    const tombstoneIds = new Set(Object.keys(shard.tombstones));

    for (const [itemId, info] of Object.entries(shard.items)) {
      if (!localIds.has(itemId) && !tombstoneIds.has(itemId)) {
        filesToFetch.push({ category, itemId, filename: info.filename, checksum: info.checksum });
      }
    }
  }

  return filesToFetch;
}

/** Process downloaded content and group by category */
function processDownloadedContent(
  filesToFetch: RemoteFetchInfo[],
  contents: Record<string, string | null>
): Map<SyncCategory, { items: Record<string, string>; checksums: Record<string, string> }> {
  const categoryItems = new Map<
    SyncCategory,
    { items: Record<string, string>; checksums: Record<string, string> }
  >();

  for (const { category, itemId, filename, checksum } of filesToFetch) {
    const content = contents[filename];
    if (!content) continue;

    try {
      const unpacked = unpackItem(filename, content, checksum);
      let catData = categoryItems.get(category);
      if (!catData) {
        catData = { items: {}, checksums: {} };
        categoryItems.set(category, catData);
      }
      catData.items[itemId] = unpacked.content;
      catData.checksums[itemId] = checksum;
    } catch (error) {
      console.error(`Failed to unpack remote item ${itemId}:`, error);
    }
  }

  return categoryItems;
}

/** Fetch remote items from shards that don't exist in local data */
export async function fetchRemoteItemsNotLocal(
  backend: StorageBackend,
  shards: Record<SyncCategory, ResolvedShard>,
  localData: CategoryData[]
): Promise<CategoryData[]> {
  const localItemIds = buildLocalItemIdMap(localData);
  const filesToFetch = collectFilesToFetch(shards, localItemIds);

  if (filesToFetch.length === 0) return [];

  syncLog(`[PUSH] Fetching ${String(filesToFetch.length)} remote items to write locally`);
  const contents = await backend.getFiles(filesToFetch.map((f) => f.filename));
  const categoryItems = processDownloadedContent(filesToFetch, contents);

  // Convert to CategoryData[]
  const result: CategoryData[] = [];
  for (const [category, { items, checksums }] of categoryItems) {
    if (Object.keys(items).length > 0) {
      syncLog(`[PUSH] Downloaded ${String(Object.keys(items).length)} remote ${category} items`);
      result.push({ category, type: 'items', items, checksums } as ItemCategoryData);
    }
  }

  return result;
}
