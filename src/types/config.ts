/**
 * Configuration Types
 */

export interface SyncConfig {
  /** GitHub Personal Access Token with 'repo' scope */
  token: string;
  /** GitHub username (auto-detected) */
  repoOwner?: string;
  /** Repository name for sync storage (default: 'opencode-sync') */
  repoName?: string;
  /** Branch name for sync (auto-detected: main or master, created if specified and missing) */
  branch?: string;
  /** Unique machine identifier (auto-generated) */
  machineId: string;
  /** Salt for encryption key derivation (base64) */
  keySalt?: string;
  /** Encrypted passphrase verification hash */
  passphraseHash?: string;
  /** Previous encryption key for key rotation (used for decryption fallback) */
  oldEncryptionKey?: string;

  // Sync behavior
  autoSyncOnStartup: boolean;
  continuousSync: boolean;
  syncIntervalMinutes: number;
  fileWatcherDebounceMs: number;
  /** Maximum time to wait before syncing even if activity continues (ms) */
  maxDebounceMs: number;

  // What to sync
  sync: {
    config: boolean;
    state: boolean;
    credentials: boolean;
    sessions: boolean;
    messages: boolean;
    projects: boolean;
    todos: boolean;
  };

  // Conflict resolution
  conflictStrategy: 'auto-merge' | 'newest-wins' | 'local-wins' | 'remote-wins' | 'ask';

  // Advisory lock settings
  advisoryLockTimeoutSeconds: number;
  maxRetryAttempts: number;
  retryDelayMs: number;

  // Tombstone settings (for per-item sync deletion propagation)
  /** Grace period in days before tombstones expire and are garbage collected (default: 30) */
  tombstoneGraceDays: number;
}

export const DEFAULT_CONFIG: Omit<SyncConfig, 'token' | 'machineId'> = {
  autoSyncOnStartup: true,
  continuousSync: true,
  syncIntervalMinutes: 5,
  fileWatcherDebounceMs: 5000,
  maxDebounceMs: 30000,
  sync: {
    config: true,
    state: true,
    credentials: true,
    sessions: true,
    messages: true,
    projects: true,
    todos: true,
  },
  conflictStrategy: 'auto-merge',
  advisoryLockTimeoutSeconds: 30,
  maxRetryAttempts: 3,
  retryDelayMs: 1000,
  tombstoneGraceDays: 30,
};
