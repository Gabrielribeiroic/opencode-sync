/**
 * Background sync operations - file watcher and interval sync.
 */

import type { PathConfig } from '../types/paths.js';
import type { SyncCategory } from '../types/index.js';
import type { SyncResult } from '../types/sync.js';
import type { CategoryData } from '../sync/operations/types.js';
import {
  loadLocalData,
  saveLocalState,
  writeLocalData,
  deleteTombstonedItems,
} from '../data/index.js';
import { FileWatcher } from '../sync/watcher/index.js';
import { syncLog } from '../sync/engine/logger.js';
import { getPluginState } from './state-manager.js';
import { log } from './logger.js';

/** Active file watcher instance */
let activeWatcher: FileWatcher | null = null;

/** Active interval timer for periodic sync */
let syncInterval: NodeJS.Timeout | null = null;

/** Write pulled data to disk after a successful pull/merge */
export async function writePulledData(pathConfig: PathConfig, result: SyncResult): Promise<void> {
  if (result.action !== 'pulled' && result.action !== 'merged') {
    return;
  }

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

/** Persist engine's local state to disk after successful sync */
export async function persistLocalState(pathConfig: PathConfig): Promise<void> {
  const state = getPluginState();
  const newState = state.engine?.getLocalState();
  if (newState) {
    await saveLocalState(pathConfig, newState);
    state.localState = newState;
  }
}

/** Start file watcher for continuous sync */
export function startFileWatcher(pathConfig: PathConfig): void {
  const state = getPluginState();

  if (!state.config?.continuousSync || !state.engine) {
    return;
  }

  try {
    const enabledCategories = new Set<SyncCategory>(
      Object.entries(state.config.sync)
        .filter(([, enabled]) => enabled)
        .map(([cat]) => cat as SyncCategory)
    );

    const config = state.config;
    const engine = state.engine;

    activeWatcher = new FileWatcher({
      pathConfig,
      debounceMs: state.config.fileWatcherDebounceMs,
      maxDebounceMs: state.config.maxDebounceMs,
      enabledCategories,
      onEvent: async () => {
        try {
          const { categories } = await loadLocalData(pathConfig, config.sync);
          const result = await engine.sync(categories);
          if (result.success) {
            await persistLocalState(pathConfig);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          log(`WARNING: File watcher sync failed: ${errMsg}`);
        }
      },
    });
    void activeWatcher.start();
    log('File watcher started');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log(`WARNING: Failed to start file watcher: ${errMsg}`);
  }
}

/** Start interval-based sync */
export function startIntervalSync(pathConfig: PathConfig): void {
  const state = getPluginState();

  if (!state.config?.continuousSync || !state.engine) {
    return;
  }

  const intervalMs = state.config.syncIntervalMinutes * 60 * 1000;
  const config = state.config;
  const engine = state.engine;

  syncInterval = setInterval(() => {
    void (async () => {
      try {
        const { categories } = await loadLocalData(pathConfig, config.sync);
        const result = await engine.sync(categories);
        if (result.success) {
          await writePulledData(pathConfig, result);
          await persistLocalState(pathConfig);
        }
        logIntervalResult(result);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log(`WARNING: Interval sync failed: ${errMsg}`);
      }
    })();
  }, intervalMs);

  const minutes = String(state.config.syncIntervalMinutes);
  log(`Interval sync started (every ${minutes} min)`);
}

/** Log interval sync results */
function logIntervalResult(result: SyncResult): void {
  if (result.action === 'pushed' || result.action === 'pulled') {
    log(`Interval sync: ${result.message}`);
  } else if (result.action === 'error') {
    log(`WARNING: Interval sync error: ${result.message}`);
  }
  // Don't log no-change to keep logs clean
}

/** Stop all background sync operations */
export function stopBackgroundSync(): void {
  if (activeWatcher) {
    activeWatcher.stop();
    activeWatcher = null;
    log('File watcher stopped');
  }

  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    log('Interval sync stopped');
  }
}
