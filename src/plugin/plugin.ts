/**
 * OpenCode Sync Plugin
 *
 * Main plugin definition with hooks and event handlers.
 */

/* eslint-disable max-lines */
import { homedir } from 'node:os';
import { getPathConfig, type PathConfig } from '../types/paths.js';
import { createEmptyManifest, type SyncCategory } from '../types/index.js';
import {
  initializeState,
  getPluginState,
  updateConfig,
  initializeEngine,
} from './state-manager.js';
import {
  getTokenSource,
  loadLocalData,
  saveLocalState,
  writeLocalData,
  deleteTombstonedItems,
} from '../data/index.js';
import { RepoStorageBackend } from '../storage/index.js';
import { FileWatcher } from '../sync/watcher/index.js';
import type { PluginState } from './types.js';
import type { CategoryData } from '../sync/operations/types.js';
import type { SyncResult } from '../types/sync.js';
import { syncLog } from '../sync/engine/logger.js';

/** Default repo name for sync storage */
const DEFAULT_REPO_NAME = '.opencode-sync';

/** Log prefix for consistent output */
const LOG_PREFIX = '[opencode-sync]';

/** Active file watcher instance */
let activeWatcher: FileWatcher | null = null;

/** Active interval timer for periodic sync */
let syncInterval: NodeJS.Timeout | null = null;

/** Log helper - writes to file only, no console output */
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} ${LOG_PREFIX} ${message}`;

  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const fs = require('node:fs') as { appendFileSync: (path: string, data: string) => void };
    const path = require('node:path') as { join: (...parts: string[]) => string };
    /* eslint-enable @typescript-eslint/no-require-imports */
    const logDir = path.join(homedir(), '.local/share/opencode/log');
    const logFile = path.join(logDir, 'opencode-sync.log');
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch {
    // Fallback to console if file write fails
    console.error(logMessage);
  }
}

/** Log setup instructions when configuration is missing */
function logSetupInstructions(): void {
  log('To configure, either:');
  log('  1. Set GITHUB_TOKEN environment variable (with repo scope)');
  log('  2. Create ~/.config/opencode/opencode-sync.json with token');
}

/** Validate configuration and log status. Returns true if valid. */
function validateAndLogConfig(state: PluginState): boolean {
  if (!state.config) {
    log('WARNING: No configuration found');
    logSetupInstructions();
    log('Plugin loaded but sync is disabled');
    return false;
  }

  if (!state.config.token) {
    log('WARNING: No GitHub token configured');
    logSetupInstructions();
    log('Plugin loaded but sync is disabled');
    return false;
  }

  const sourceLabel = getTokenSource() === 'env' ? 'environment variable' : 'config file';
  log(`Token loaded from: ${sourceLabel}`);

  return true;
}

/** Fetch authenticated user's GitHub username */
async function getGitHubUsername(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to get GitHub user: ${String(res.status)}`);
  }

  const user = (await res.json()) as { login: string };
  return user.login;
}

/** Check if repo exists */
async function repoExists(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  return res.ok;
}

/** Create a new private repo */
async function createRepo(token: string, name: string): Promise<void> {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description: 'OpenCode Sync Storage',
      private: true,
      auto_init: true,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Failed to create repo: ${err.message ?? String(res.status)}`);
  }
}

/** Initialize storage backend with manifest */
async function initializeStorageBackend(
  token: string,
  owner: string,
  repo: string,
  machineId: string
): Promise<void> {
  const backend = new RepoStorageBackend({ token, owner, repo });
  const storageExists = await backend.exists();
  if (!storageExists) {
    log('Initializing sync storage...');
    const manifest = createEmptyManifest(machineId);
    await backend.initialize(JSON.stringify(manifest, null, 2));
  }
}

/** Create repository if it doesn't exist */
async function ensureRepoCreated(token: string, owner: string, repoName: string): Promise<void> {
  const exists = await repoExists(token, owner, repoName);
  if (!exists) {
    log('Creating sync repository...');
    await createRepo(token, repoName);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** Ensure sync storage repo exists and is initialized */
async function ensureStorageExists(pathConfig: PathConfig): Promise<void> {
  const state = getPluginState();
  const config = state.config;

  if (!config?.token || !config.machineId) return;

  if (config.repoOwner && config.repoName) {
    log(`Linked to repo: ${config.repoOwner}/${config.repoName}`);
    initializeEngine();
    return;
  }

  try {
    log('Setting up sync storage...');
    const owner = await getGitHubUsername(config.token);
    const repoName = DEFAULT_REPO_NAME;

    await ensureRepoCreated(config.token, owner, repoName);
    await initializeStorageBackend(config.token, owner, repoName, config.machineId);

    log(`Linked to repo: ${owner}/${repoName}`);
    await updateConfig(pathConfig, { repoOwner: owner, repoName });
    initializeEngine();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log(`ERROR: Failed to setup storage: ${errMsg}`);
    throw error;
  }
}

/** Write pulled data to disk after a successful pull/merge */
async function writePulledData(pathConfig: PathConfig, result: SyncResult): Promise<void> {
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
async function persistLocalState(pathConfig: PathConfig): Promise<void> {
  const state = getPluginState();
  const newState = state.engine?.getLocalState();
  if (newState) {
    await saveLocalState(pathConfig, newState);
    state.localState = newState;
  }
}

/** Perform initial sync on plugin startup (non-blocking) */
function performInitialSync(pathConfig: PathConfig): void {
  const state = getPluginState();

  if (!state.isInitialized || !state.engine) {
    log('Skipping initial sync - engine not initialized');
    return;
  }

  if (!state.config?.autoSyncOnStartup) {
    log('Auto-sync on startup disabled');
    return;
  }

  // Run sync in background - don't block plugin startup
  const config = state.config;
  const engine = state.engine;
  void (async () => {
    try {
      log('Running initial sync in background...');
      const loadStart = Date.now();
      const { categories, errors } = await loadLocalData(pathConfig, config.sync);
      log(`Loaded ${String(categories.length)} categories in ${String(Date.now() - loadStart)}ms`);
      if (errors.length > 0) log(`Load errors: ${String(errors.length)}`);

      const syncStart = Date.now();
      const result = await engine.sync(categories);
      const dur = Date.now() - syncStart;

      if (result.success && result.action !== 'error') {
        // Write pulled data to disk BEFORE persisting state
        await writePulledData(pathConfig, result);
        await persistLocalState(pathConfig);
        log(`Initial sync complete in ${String(dur)}ms: ${result.message}`);
      } else {
        log(`Sync completed in ${String(dur)}ms: ${result.message}`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log(`WARNING: Initial sync failed: ${errMsg}`);
      if (error instanceof Error && error.stack) log(`Stack: ${error.stack}`);
    }
  })();
}

/** Start file watcher for continuous sync */
function startFileWatcher(pathConfig: PathConfig): void {
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
function startIntervalSync(pathConfig: PathConfig): void {
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
        // Write pulled data and persist state after successful sync
        if (result.success) {
          await writePulledData(pathConfig, result);
          await persistLocalState(pathConfig);
        }
        // Log interval sync results (both success and no-change)
        if (result.action === 'pushed') {
          log(`Interval sync: ${result.message}`);
        } else if (result.action === 'pulled') {
          log(`Interval sync: ${result.message}`);
        } else if (result.action === 'no-change') {
          // Don't log no-change to keep logs clean
        } else if (result.action === 'error') {
          log(`WARNING: Interval sync error: ${result.message}`);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log(`WARNING: Interval sync failed: ${errMsg}`);
      }
    })();
  }, intervalMs);

  const minutes = String(state.config.syncIntervalMinutes);
  log(`Interval sync started (every ${minutes} min)`);
}

/** Stop all background sync operations */
function stopBackgroundSync(): void {
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

export const OpencodeSyncPlugin = async (_ctx: unknown): Promise<Record<string, unknown>> => {
  log('Plugin starting...');

  try {
    const pathConfig = getPathConfig(homedir());
    await initializeState(pathConfig);
    const isValid = validateAndLogConfig(getPluginState());

    if (isValid) {
      await ensureStorageExists(pathConfig);
      performInitialSync(pathConfig);
      startFileWatcher(pathConfig);
      startIntervalSync(pathConfig);
      log('Plugin ready');
    }

    // Return cleanup function
    // Note: OpenCode doesn't currently expose a shutdown hook for plugins,
    // so this cleanup may not be called. See: https://github.com/anomalyco/opencode/issues/XXX
    return { cleanup: stopBackgroundSync };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    log(`ERROR: Plugin initialization failed: ${errMsg}`);
    if (stack) {
      console.error(stack);
    }
    return {};
  }
};
