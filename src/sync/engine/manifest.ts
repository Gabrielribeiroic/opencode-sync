/**
 * Manifest Operations
 *
 * Handles fetching and parsing the remote manifest, including sharded manifests.
 */

import type { StorageBackend } from '../../storage/index.js';
import { RepoApiError } from '../../storage/index.js';
import type { Manifest, CategoryShard, ItemCategoryInfo } from '../../types/index.js';
import { isShardedRef, type SyncCategory } from '../../types/index.js';
import { MANIFEST_FILENAME } from './types.js';
import { syncLog } from './logger.js';

/**
 * Fetch and parse the manifest from storage.
 */
export async function fetchManifest(backend: StorageBackend): Promise<Manifest | null> {
  try {
    const content = await backend.getFile(MANIFEST_FILENAME);
    if (!content) return null;

    return JSON.parse(content) as Manifest;
  } catch (error) {
    if (error instanceof RepoApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Fetch a category shard from storage.
 */
export async function fetchCategoryShard(
  backend: StorageBackend,
  shardFile: string
): Promise<CategoryShard | null> {
  let content: string | null = null;
  try {
    content = await backend.getFile(shardFile);
    if (!content) return null;
    return JSON.parse(content) as CategoryShard;
  } catch (error) {
    if (error instanceof RepoApiError && error.status === 404) {
      return null;
    }
    // Log JSON parse errors for debugging with content preview
    if (error instanceof SyntaxError) {
      const preview = content ? content.slice(0, 200) : 'null';
      syncLog(`[MANIFEST] JSON parse error in ${shardFile}: ${error.message}`);
      syncLog(`[MANIFEST] Content preview: ${preview}`);
    }
    throw error;
  }
}

/**
 * Resolve a category's full info, loading shard if needed.
 * Returns ItemCategoryInfo for sharded categories.
 */
export async function resolveCategoryInfo(
  manifest: Manifest,
  category: SyncCategory,
  backend: StorageBackend
): Promise<ItemCategoryInfo | null> {
  const info = manifest.categories[category];
  if (!info) return null;

  // If it's already an item category, return as-is
  if (info.type === 'items') {
    return info;
  }

  // If it's a sharded reference, load the shard
  if (isShardedRef(info)) {
    const shard = await fetchCategoryShard(backend, info.shardFile);
    if (!shard) return null;

    // Convert shard to ItemCategoryInfo
    return {
      type: 'items',
      items: shard.items,
      tombstones: shard.tombstones,
      itemCount: Object.keys(shard.items).length,
      lastModified: info.lastModified,
      lastModifiedBy: info.lastModifiedBy,
    };
  }

  return null;
}
