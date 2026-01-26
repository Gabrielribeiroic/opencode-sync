/**
 * Sync Result Handler
 *
 * Shared utilities for processing sync results - writing pulled data
 * and persisting local state after successful sync operations.
 */

import type { PathConfig } from '../types/paths.js';
import type { SyncResult } from '../types/sync.js';
import type { CategoryData } from '../sync/operations/types.js';
import { writeLocalData, deleteTombstonedItems, saveLocalState } from '../data/index.js';
import { syncLog } from '../logging/index.js';
import { getPluginState } from '../plugin/state-manager.js';

/** Actions that should trigger writing pulled data to disk */
const WRITE_ACTIONS = new Set(['pulled', 'merged', 'pushed']);

/**
 * Write pulled data to disk after a successful sync.
 * Handles pulled, merged, and pushed actions that may include remote data.
 */
export async function writePulledData(pathConfig: PathConfig, result: SyncResult): Promise<void> {
  if (!WRITE_ACTIONS.has(result.action)) {
    syncLog(`[WRITE] Skipping write - action: ${result.action}`);
    return;
  }

  syncLog(
    `[WRITE] Action: ${result.action}, pulledData: ${result.pulledData ? 'present' : 'missing'}`
  );

  if (result.pulledData) {
    const data = result.pulledData as CategoryData[];
    syncLog(`[WRITE] Writing ${String(data.length)} categories to disk`);
    await writeLocalData(pathConfig, data);
    syncLog(`[WRITE] Finished writing to disk`);
  }

  if (result.tombstonedItems) {
    await deleteTombstonedItems(pathConfig, result.tombstonedItems);
  }
}

/**
 * Persist engine's local state to disk after successful sync.
 * Updates both the state file and the in-memory plugin state.
 */
export async function persistLocalState(pathConfig: PathConfig): Promise<void> {
  const state = getPluginState();
  const newState = state.engine?.getLocalState();
  if (newState) {
    await saveLocalState(pathConfig, newState);
    state.localState = newState;
  }
}

/**
 * Process a successful sync result - write data and persist state.
 * Combines writePulledData and persistLocalState into a single call.
 */
export async function processSyncResult(pathConfig: PathConfig, result: SyncResult): Promise<void> {
  await writePulledData(pathConfig, result);
  await persistLocalState(pathConfig);
}
