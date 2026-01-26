/**
 * Directory Watcher
 *
 * Low-level directory and file watching logic.
 */

import type { FSWatcher, WatchEventType } from 'node:fs';
import { watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SyncCategory, WatcherEvent } from './types.js';
import { shouldIgnore } from './ignore-patterns.js';

export interface DirectoryWatcherCallbacks {
  onEvent: (type: WatcherEvent['type'], path: string, category: SyncCategory) => void;
  onError: (path: string, error: Error) => void;
}

/**
 * Watch a path (file or directory) for changes.
 */
export async function watchPath(
  basePath: string,
  category: SyncCategory,
  watchers: Map<string, FSWatcher>,
  callbacks: DirectoryWatcherCallbacks
): Promise<void> {
  try {
    const stats = await stat(basePath);

    if (stats.isDirectory()) {
      watchDirectory(basePath, category, watchers, callbacks);
    } else if (stats.isFile()) {
      watchFile(basePath, category, watchers, callbacks);
    }
  } catch {
    watchForCreation(basePath, category, watchers, callbacks);
  }
}

/**
 * Watch a directory recursively.
 */
function watchDirectory(
  dirPath: string,
  category: SyncCategory,
  watchers: Map<string, FSWatcher>,
  callbacks: DirectoryWatcherCallbacks
): void {
  if (watchers.has(dirPath)) return;

  try {
    const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (filename) {
        const fullPath = join(dirPath, filename);
        handleWatchEvent(eventType, fullPath, category, callbacks);
      }
    });

    watcher.on('error', (error) => {
      callbacks.onError(dirPath, error);
      watchers.delete(dirPath);
    });

    watchers.set(dirPath, watcher);
  } catch (error) {
    callbacks.onError(dirPath, error as Error);
  }
}

/**
 * Watch a single file.
 */
function watchFile(
  filePath: string,
  category: SyncCategory,
  watchers: Map<string, FSWatcher>,
  callbacks: DirectoryWatcherCallbacks
): void {
  if (watchers.has(filePath)) return;

  try {
    const watcher = watch(filePath, (eventType) => {
      handleWatchEvent(eventType, filePath, category, callbacks);
    });

    watcher.on('error', (error) => {
      callbacks.onError(filePath, error);
      watchers.delete(filePath);
    });

    watchers.set(filePath, watcher);
  } catch (error) {
    callbacks.onError(filePath, error as Error);
  }
}

/**
 * Watch parent directory for a path to be created.
 */
function watchForCreation(
  targetPath: string,
  category: SyncCategory,
  watchers: Map<string, FSWatcher>,
  callbacks: DirectoryWatcherCallbacks
): void {
  const parentDir = join(targetPath, '..');
  const watchKey = `parent:${targetPath}`;

  if (watchers.has(watchKey)) return;

  try {
    const watcher = watch(parentDir, (_eventType, filename) => {
      if (filename && join(parentDir, filename) === targetPath) {
        watcher.close();
        watchers.delete(watchKey);
        void watchPath(targetPath, category, watchers, callbacks);
      }
    });

    watcher.on('error', () => {
      watchers.delete(watchKey);
    });

    watchers.set(watchKey, watcher);
  } catch {
    // Parent doesn't exist either - skip
  }
}

/**
 * Handle a watch event.
 */
function handleWatchEvent(
  eventType: WatchEventType,
  filePath: string,
  category: SyncCategory,
  callbacks: DirectoryWatcherCallbacks
): void {
  if (shouldIgnore(filePath)) return;

  const type = mapEventType(eventType);
  callbacks.onEvent(type, filePath, category);
}

/**
 * Map fs.watch event type to our event type.
 */
function mapEventType(eventType: WatchEventType): WatcherEvent['type'] {
  switch (eventType) {
    case 'rename':
      return 'add';
    case 'change':
      return 'change';
    default:
      return 'change';
  }
}
