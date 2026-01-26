/**
 * Plugin State Manager
 *
 * Manages plugin state and provides operations for config/engine management.
 */

import type { PathConfig } from '../types/paths.js';
import type { SyncConfig, SyncCategory } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import type { SyncEngineOptions } from '../sync/engine/index.js';
import { SyncEngine } from '../sync/engine/index.js';
import type { RepoClientConfig } from '../storage/index.js';
import { RepoStorageBackend } from '../storage/index.js';
import { createFileWatcher } from '../sync/watcher/index.js';
import { loadConfig, saveConfig, loadLocalState, generateMachineId } from '../data/index.js';
import type { PluginState } from './types.js';
import { createInitialState } from './types.js';

const state: PluginState = createInitialState();

/**
 * Initialize the plugin state from disk.
 */
export async function initializeState(pathConfig: PathConfig): Promise<void> {
  state.pathConfig = pathConfig;
  state.config = await loadConfig(pathConfig);
  state.localState = await loadLocalState(pathConfig);
}

/**
 * Get the current plugin state.
 */
export function getPluginState(): PluginState {
  return state;
}

/**
 * Initialize the sync engine with current configuration.
 */
export function initializeEngine(): void {
  if (!state.config) return;
  if (!state.config.repoOwner || !state.config.repoName) return;

  const backendConfig: RepoClientConfig = {
    token: state.config.token,
    owner: state.config.repoOwner,
    repo: state.config.repoName,
  };
  if (state.config.branch) {
    backendConfig.branch = state.config.branch;
  }
  const backend = new RepoStorageBackend(backendConfig);

  // Support key rotation: oldEncryptionKey from config is used as fallback for decryption
  const oldKey = state.oldPassphrase ?? state.config.oldEncryptionKey;

  // Build engine options, conditionally adding optional properties
  const engineOptions: SyncEngineOptions = {
    config: state.config,
    backend,
    localState: state.localState,
    passphrase: state.passphrase ?? undefined,
  };
  if (oldKey) {
    engineOptions.oldPassphrase = oldKey;
  }
  if (state.pathConfig?.lockPath) {
    engineOptions.lockPath = state.pathConfig.lockPath;
  }

  state.engine = new SyncEngine(engineOptions);

  state.isInitialized = true;
}

/**
 * Update plugin configuration.
 */
export async function updateConfig(
  pathConfig: PathConfig,
  updates?: Partial<SyncConfig>
): Promise<void> {
  // Guard against undefined updates
  if (!updates) {
    console.error('[opencode-sync] updateConfig called with undefined updates');
    return;
  }

  if (!state.config) {
    state.config = {
      ...DEFAULT_CONFIG,
      token: updates.token ?? '',
      machineId: generateMachineId(),
      ...updates,
    };
  } else {
    state.config = { ...state.config, ...updates };
  }

  await saveConfig(pathConfig, state.config);
  initializeEngine();
}

/**
 * Set encryption passphrase.
 */
export function setPassphrase(passphrase: string): void {
  state.passphrase = passphrase;
  if (state.config) {
    initializeEngine();
  }
}

/**
 * Start file watcher for continuous sync.
 */
export async function startWatcher(
  pathConfig: PathConfig,
  onSync: () => Promise<void>
): Promise<void> {
  if (!state.config?.continuousSync) return;

  state.watcher = createFileWatcher(
    pathConfig,
    async () => {
      await onSync();
    },
    {
      debounceMs: state.config.fileWatcherDebounceMs,
      enabledCategories: new Set(
        Object.entries(state.config.sync)
          .filter(([, enabled]) => enabled)
          .map(([category]) => category as SyncCategory)
      ),
    }
  );

  await state.watcher.start();
}

/**
 * Stop file watcher.
 */
export function stopWatcher(): void {
  state.watcher?.stop();
  state.watcher = null;
}
