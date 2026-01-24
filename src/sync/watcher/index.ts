/**
 * Watcher Module
 *
 * File system watching for continuous sync.
 */

import type { PathConfig } from '../../types/index.js';
import { FileWatcher } from './file-watcher.js';
import type { FileWatcherOptions } from './types.js';

export { FileWatcher } from './file-watcher.js';
export type { FileWatcherOptions } from './types.js';

/**
 * Create a file watcher with default options.
 */
export function createFileWatcher(
  pathConfig: PathConfig,
  onEvent: FileWatcherOptions['onEvent'],
  options?: Partial<Omit<FileWatcherOptions, 'pathConfig' | 'onEvent'>>
): FileWatcher {
  return new FileWatcher({
    pathConfig,
    onEvent,
    debounceMs: options?.debounceMs ?? 2000,
    enabledCategories:
      options?.enabledCategories ??
      new Set(['config', 'state', 'credentials', 'sessions', 'messages', 'projects', 'todos']),
  });
}
