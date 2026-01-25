/**
 * Plugin Types
 *
 * Type definitions for the OpenCode Sync plugin.
 */

import type { SyncConfig, LocalSyncState } from '../types/index.js';
import type { PathConfig } from '../types/paths.js';
import type { SyncEngine } from '../sync/engine/index.js';
import type { FileWatcher } from '../sync/watcher/index.js';

export interface PluginState {
  config: SyncConfig | null;
  localState: LocalSyncState | null;
  engine: SyncEngine | null;
  watcher: FileWatcher | null;
  passphrase: string | null;
  /** Previous encryption key for key rotation */
  oldPassphrase: string | null;
  isInitialized: boolean;
  /** Path configuration for lock file and other paths */
  pathConfig: PathConfig | null;
}

export function createInitialState(): PluginState {
  return {
    config: null,
    localState: null,
    engine: null,
    watcher: null,
    passphrase: null,
    oldPassphrase: null,
    isInitialized: false,
    pathConfig: null,
  };
}
