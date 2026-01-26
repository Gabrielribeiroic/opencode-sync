/**
 * Sync Handler
 *
 * Handles sync operations triggered by events.
 */

import type { PathConfig } from '../types/paths.js';
import type { SyncResult } from '../types/index.js';
import { loadLocalData } from '../data/index.js';
import { getPluginState } from './state-manager.js';
import { isPluginReady } from './validation.js';
import { getErrorMessage, writePulledData, persistLocalState } from '../shared/index.js';

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

  if (!isPluginReady(state)) {
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
    await logSyncError(client, getErrorMessage(error));
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
  // Write pulled data and persist state using shared utilities
  await writePulledData(pathConfig, result);
  await persistLocalState(pathConfig);

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
