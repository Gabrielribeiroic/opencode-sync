/**
 * Pull-then-Push Operation
 *
 * Handles the combined pull-then-push operation for sync.
 */

import type { StorageBackend } from '../../storage/index.js';
import type { Manifest, SyncResult } from '../../types/index.js';
import type { CategoryData } from '../operations/types.js';
import { syncLog } from '../../logging/index.js';
import { fetchManifest } from './manifest.js';

/** Context needed for pull-then-push operation */
export interface PullPushContext {
  backend: StorageBackend;
  performPull: (manifest?: Manifest, data?: CategoryData[]) => Promise<SyncResult>;
  push: (data: CategoryData[], retry: number, manifest: Manifest) => Promise<SyncResult>;
}

/**
 * Pull remote changes, then push local changes if needed.
 */
export async function pullThenPush(
  ctx: PullPushContext,
  manifest: Manifest,
  data: CategoryData[],
  retry: number
): Promise<SyncResult> {
  // First pull remote changes
  const pullResult = await ctx.performPull(manifest, data);
  if (!pullResult.success) return pullResult;

  // After pull, check if local data still needs pushing
  // Re-fetch manifest to get updated state after pull wrote new state
  const newManifest = await fetchManifest(ctx.backend);
  if (!newManifest) return pullResult;

  // Check if local has changes that need pushing
  const { needsPush } = await import('../operations/push.js');
  if (needsPush(data, newManifest)) {
    syncLog('[SYNC] Local has changes after pull, pushing...');
    const pushResult = await ctx.push(data, retry, newManifest);
    // Combine results - report both pull and push
    return {
      ...pushResult,
      action: 'merged',
      message: `Pulled then pushed: ${pullResult.message}, ${pushResult.message}`,
    };
  }

  return pullResult;
}
