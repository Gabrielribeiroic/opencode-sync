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
  /** Unique machine identifier (auto-generated) */
  machineId: string;
  /** Salt for encryption key derivation (base64) */
  keySalt?: string;
  /** Encrypted passphrase verification hash */
  passphraseHash?: string;

  // Sync behavior
  autoSyncOnStartup: boolean;
  continuousSync: boolean;
  syncIntervalMinutes: number;
  fileWatcherDebounceMs: number;

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
}

export const DEFAULT_CONFIG: Omit<SyncConfig, 'token' | 'machineId'> = {
  autoSyncOnStartup: true,
  continuousSync: true,
  syncIntervalMinutes: 1,
  fileWatcherDebounceMs: 2000,
  sync: {
    config: true,
    state: true,
    credentials: true,
    sessions: true,
    messages: false, // Disabled by default - can be very large (>8MB)
    projects: true,
    todos: true,
  },
  conflictStrategy: 'auto-merge',
  advisoryLockTimeoutSeconds: 30,
  maxRetryAttempts: 3,
  retryDelayMs: 1000,
};
