/**
 * Sync Engine Types
 *
 * Type definitions for the sync engine.
 */

import type { SyncConfig, LocalSyncState } from '../../types/index.js';
import type { StorageBackend } from '../../storage/index.js';

export interface SyncEngineOptions {
  config: SyncConfig;
  backend: StorageBackend;
  localState: LocalSyncState | null;
  passphrase: string | undefined;
  /** Previous encryption key for key rotation */
  oldPassphrase?: string;
  /** Lock file path for multi-instance coordination */
  lockPath?: string;
}

export const MANIFEST_FILENAME = 'manifest.json';
