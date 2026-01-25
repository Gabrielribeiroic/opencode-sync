/**
 * File Watcher Types
 *
 * Type definitions for the file watcher.
 */

import type { SyncCategory, WatcherEvent, PathConfig } from '../../types/index.js';

export interface FileWatcherOptions {
  pathConfig: PathConfig;
  debounceMs: number;
  /** Maximum time to wait before syncing even if activity continues (ms) */
  maxDebounceMs: number;
  onEvent: (events: WatcherEvent[]) => void | Promise<void>;
  enabledCategories: Set<SyncCategory>;
}

export type { WatcherEvent, SyncCategory, PathConfig };
