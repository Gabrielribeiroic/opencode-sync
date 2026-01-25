/**
 * Sync Routing Logic
 *
 * Determines sync action based on vector clock comparison.
 */

import { compareVectorClocks } from '../vector-clock.js';
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
 * Determine sync action based on vector clock comparison.
 */
export function determineAction(
  localState: LocalSyncState | null,
  remoteManifest: Manifest,
  localData: CategoryData[]
): RouteResult {
  const cmp = compareVectorClocks(localState?.vectorClock ?? {}, remoteManifest.vectorClock);
  const pushNeeded = cmp === 'equal' ? needsPush(localData, remoteManifest) : false;
  syncLog(`[SYNC] Clock: ${cmp}, needsPush=${String(pushNeeded)}`);

  switch (cmp) {
    case 'equal':
      return pushNeeded ? { action: 'push' } : { action: 'no-change' };
    case 'local-ahead':
      return { action: 'push' };
    case 'remote-ahead':
      return { action: 'pull' };
    case 'concurrent':
      return { action: 'conflict' };
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
      return handlers.conflict();
    case 'no-change':
      return buildNoChangeResult();
  }
}
