/**
 * Sync Engine Types
 *
 * Type definitions for the sync engine.
 */

import type { SyncConfig, LocalSyncState } from '../../types/index.js';
import type { StorageBackend } from '../../storage/index.js';
import type { CryptoOptions } from '../operations/types.js';

export interface SyncEngineOptions {
  config: SyncConfig;
  backend: StorageBackend;
  localState: LocalSyncState | null;
  passphrase: string | undefined;
  /** Previous encryption key for key rotation */
  oldPassphrase?: string;
}

/** Get crypto options from engine options */
export function getCryptoOptions(options: {
  passphrase?: string;
  oldPassphrase?: string;
}): CryptoOptions {
  const result: CryptoOptions = {};
  if (options.passphrase) result.passphrase = options.passphrase;
  if (options.oldPassphrase) result.oldPassphrase = options.oldPassphrase;
  return result;
}

export const MANIFEST_FILENAME = 'manifest.json';
