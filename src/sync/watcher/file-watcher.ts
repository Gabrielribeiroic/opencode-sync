/**
 * File Watcher
 *
 * High-level file watcher that coordinates watching multiple paths.
 */

import type { FSWatcher } from 'node:fs';
import { getCategoryPaths } from '../../types/paths.js';
import type { FileWatcherOptions, WatcherEvent, SyncCategory } from './types.js';
import { watchPath } from './directory-watcher.js';

export class FileWatcher {
  private readonly options: FileWatcherOptions;
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly pendingEvents = new Map<string, WatcherEvent>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private firstEventTime: number | null = null;
  private isRunning = false;

  constructor(options: FileWatcherOptions) {
    this.options = options;
  }

  /**
   * Start watching all configured directories.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const categoryPaths = getCategoryPaths(this.options.pathConfig);

    for (const [category, paths] of Object.entries(categoryPaths)) {
      if (!this.options.enabledCategories.has(category as SyncCategory)) {
        continue;
      }

      for (const basePath of paths) {
        await watchPath(basePath, category as SyncCategory, this.watchers, {
          onEvent: (type, path, cat) => {
            this.handleEvent(type, path, cat);
          },
          onError: (path, error) => {
            console.error(`Watch error on ${path}:`, error);
          },
        });
      }
    }
  }

  /**
   * Stop all watchers.
   */
  public stop(): void {
    this.isRunning = false;

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.maxDelayTimer) {
      clearTimeout(this.maxDelayTimer);
      this.maxDelayTimer = null;
    }

    this.firstEventTime = null;
    this.pendingEvents.clear();
  }

  /**
   * Check if watcher is running.
   */
  public get running(): boolean {
    return this.isRunning;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  private handleEvent(type: WatcherEvent['type'], path: string, category: SyncCategory): void {
    const event: WatcherEvent = { type, path, category };
    this.pendingEvents.set(path, event);

    // Track first event time for max delay cap
    if (this.firstEventTime === null) {
      this.firstEventTime = Date.now();

      // Set up max delay timer - will force flush even if activity continues
      this.maxDelayTimer = setTimeout(() => {
        void this.flushEvents();
      }, this.options.maxDebounceMs);
    }

    // Reset debounce timer on each event
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.flushEvents();
    }, this.options.debounceMs);
  }

  private async flushEvents(): Promise<void> {
    if (this.pendingEvents.size === 0) return;

    const events = Array.from(this.pendingEvents.values());
    this.pendingEvents.clear();

    // Clear both timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxDelayTimer) {
      clearTimeout(this.maxDelayTimer);
      this.maxDelayTimer = null;
    }
    this.firstEventTime = null;

    try {
      await this.options.onEvent(events);
    } catch (error) {
      console.error('Error handling file events:', error);
    }
  }
}
