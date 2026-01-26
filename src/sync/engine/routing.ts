/**
 * Sync Routing Logic
 *
 * Determines sync action based on timestamp comparison (last-write-wins).
 */

import { compareTimestamps } from '../vector-clock.js';
import { syncLog } from './logger.js';
import { needsPush } from '../operations/push.js';
import type { Manifest, SyncResult, LocalSyncState } from '../../types/index.js';
import type { CategoryData } from '../operations/types.js';
import { buildNoChangeResult } from './result.js';

export type SyncAction = 'push' | 'pull' | 'conflict' | 'no-change';

export interface RouteResult {
  action: SyncAction;
  needsRetry?: boolean;
}

/**
 * Determine sync action based on timestamp comparison.
 * Uses last-write-wins semantics - no more 'concurrent' state.
 */
export function determineAction(
  localState: LocalSyncState | null,
  remoteManifest: Manifest,
  localData: CategoryData[]
): RouteResult {
  const localTimestamp = localState?.lastSyncedAt;
  const remoteTimestamp = remoteManifest.updatedAt;

  const cmp = compareTimestamps(localTimestamp, remoteTimestamp);
  // Check needsPush for both 'equal' and 'local-newer' cases
  const pushNeeded = cmp !== 'remote-newer' ? needsPush(localData, remoteManifest) : false;
  syncLog(`[SYNC] Timestamp: ${cmp}, needsPush=${String(pushNeeded)}`);

  switch (cmp) {
    case 'equal':
    case 'local-newer':
      // Same or local newer - only push if there are actual changes
      return pushNeeded ? { action: 'push' } : { action: 'no-change' };
    case 'remote-newer':
      // Remote has newer changes - pull first, then push if local has changes
      // This implements last-write-wins: remote wins, we'll push our changes after
      return { action: 'pull' };
  }
}

/**
 * Execute routing decision and return result.
 */
export async function executeRoute(
  route: RouteResult,
  handlers: {
    push: () => Promise<SyncResult>;
    pull: () => Promise<SyncResult>;
    conflict: () => Promise<SyncResult>;
  }
): Promise<SyncResult> {
  switch (route.action) {
    case 'push':
      return handlers.push();
    case 'pull':
      return handlers.pull();
    case 'conflict':
      // With timestamp-based sync, conflicts are resolved by last-write-wins
      // This handler is kept for API compatibility but routes to pull
      return handlers.pull();
    case 'no-change':
      return buildNoChangeResult();
  }
}
