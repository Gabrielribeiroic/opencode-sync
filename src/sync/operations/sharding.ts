/**
 * Sharding Operations
 *
 * Handles writing sharded category manifests for large item collections.
 */

import { calculateChecksum } from '../packer.js';
import {
  type ItemCategoryInfo,
  type ItemInfo,
  type CategoryShard,
  type ShardedCategoryRef,
  getShardFilename,
  shouldShard,
} from '../../types/index.js';
import type { Tombstone } from '../../types/manifest.js';
import type { PushContext, SyncCategory } from './types.js';

export { shouldShard };

/** Write inline item category (not sharded) to manifest */
export function writeInlineItemCategory(
  category: SyncCategory,
  items: Record<string, ItemInfo>,
  tombstones: Record<string, Tombstone>,
  ctx: PushContext
): void {
  ctx.manifest.categories[category] = {
    type: 'items',
    items,
    tombstones,
    itemCount: Object.keys(items).length,
    lastModified: ctx.now,
    lastModifiedBy: ctx.machineId,
    vectorClock: { [ctx.machineId]: ctx.newClock[ctx.machineId] ?? 1 },
  } satisfies ItemCategoryInfo;
}

/**
 * Write a sharded category (items stored in separate shard file).
 */
export function writeShardedCategory(
  category: SyncCategory,
  items: Record<string, ItemInfo>,
  tombstones: Record<string, Tombstone>,
  ctx: PushContext
): void {
  const shardFile = getShardFilename(category);

  // Create shard content
  const shard: CategoryShard = {
    category,
    schemaVersion: '1.0',
    items,
    tombstones,
    updatedAt: ctx.now,
  };

  const shardContent = JSON.stringify(shard, null, 2);
  const shardChecksum = calculateChecksum(shardContent);

  // Write shard file
  ctx.files[shardFile] = { content: shardContent };

  // Write sharded reference to manifest
  ctx.manifest.categories[category] = {
    type: 'sharded',
    shardFile,
    shardChecksum,
    itemCount: Object.keys(items).length,
    tombstoneCount: Object.keys(tombstones).length,
    lastModified: ctx.now,
    lastModifiedBy: ctx.machineId,
    vectorClock: { [ctx.machineId]: ctx.newClock[ctx.machineId] ?? 1 },
  } satisfies ShardedCategoryRef;
}
