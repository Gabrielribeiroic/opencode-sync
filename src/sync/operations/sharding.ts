/**
 * Sharding Operations
 *
 * Handles writing sharded category manifests for large item collections.
 */

import { calculateChecksum } from '../packer.js';
import {
  type ItemInfo,
  type CategoryShard,
  type ShardedCategoryRef,
  getShardFilename,
} from '../../types/index.js';
import type { Tombstone } from '../../types/manifest.js';
import type { PushContext, SyncCategory } from './types.js';

/**
 * Write a sharded category (items stored in separate shard file).
 * Returns the shard filename for tracking.
 */
export function writeShardedCategory(
  category: SyncCategory,
  items: Record<string, ItemInfo>,
  tombstones: Record<string, Tombstone>,
  ctx: PushContext
): string {
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

  return shardFile;
}
