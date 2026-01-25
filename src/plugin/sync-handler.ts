/**
 * Sync Handler
 *
 * Handles sync operations triggered by events.
 */

import type { PathConfig } from '../types/paths.js';
import type { SyncResult } from '../types/index.js';
import type { CategoryData } from '../sync/operations/types.js';
import {
  loadLocalData,
  saveLocalState,
  writeLocalData,
  deleteTombstonedItems,
} from '../data/index.js';
import { getPluginState } from './state-manager.js';
import { syncLog } from '../sync/engine/logger.js';

type LogLevel = 'error' | 'info' | 'debug' | 'warn';

interface LogClient {
  app: {
    log: (options: {
      body: { service: string; level: LogLevel; message: string };
    }) => Promise<unknown>;
  };
}

/**
 * Perform a sync operation.
 */
export async function performSync(pathConfig: PathConfig, client: LogClient): Promise<void> {
  const state = getPluginState();

  if (!state.config || !state.engine) {
    return;
  }

  try {
    const { categories } = await loadLocalData(pathConfig, state.config.sync);
    const result = await state.engine.sync(categories);

    if (result.success) {
      await handleSyncSuccess(pathConfig, client, result);
    } else {
      await logSyncError(client, result.message);
    }
  } catch (error) {
    await logSyncError(client, error instanceof Error ? error.message : 'Unknown');
  }
}

/**
 * Handle successful sync.
 */
async function handleSyncSuccess(
  pathConfig: PathConfig,
  client: LogClient,
  result: SyncResult
): Promise<void> {
  const state = getPluginState();
  const newState = state.engine?.getLocalState();

  // Write pulled data to local filesystem
  // This includes data from pull, merge, AND remote items fetched during push
  if (result.action === 'pulled' || result.action === 'merged' || result.action === 'pushed') {
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
  } else {
    syncLog(`[WRITE] Skipping write - action: ${result.action}`);
  }

  if (newState) {
    await saveLocalState(pathConfig, newState);
    state.localState = newState;
  }

  await client.app.log({
    body: {
      service: 'opencode-sync',
      level: 'info',
      message: `Sync ${result.action}: ${result.message}`,
    },
  });
}

/**
 * Log a sync error.
 */
async function logSyncError(client: LogClient, message: string): Promise<void> {
  await client.app.log({
    body: {
      service: 'opencode-sync',
      level: 'error',
      message: `Sync failed: ${message}`,
    },
  });
}
