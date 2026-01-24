/**
 * Sync Engine
 *
 * Core orchestration for push/pull operations with optimistic concurrency.
 * Uses vector clocks for conflict detection and delegates to operation modules.
 */

import type { StorageBackend } from '../../storage/index.js';
import { RepoConflictError } from '../../storage/index.js';
import { compareVectorClocks } from '../vector-clock.js';
import { preparePushData, needsPush } from '../operations/push.js';
import { pullCategories } from '../operations/pull.js';
import { mergeAllCategories } from '../operations/merge-operation.js';
import {
  createEmptyManifest,
  type Manifest,
  type SyncResult,
  type LocalSyncState,
} from '../../types/index.js';
import type { CategoryData, StorageFiles } from '../operations/types.js';
import type { SyncEngineOptions } from './types.js';
import { MANIFEST_FILENAME } from './types.js';
import { fetchManifest } from './manifest.js';
import { buildLocalState, isLockedByOther } from './state.js';
import {
  buildPushResult,
  buildPullResult,
  buildConflictResult,
  buildErrorResult,
  buildNoChangeResult,
  handleSyncError,
} from './result.js';

export { type CategoryData };

export class SyncEngine {
  private readonly backend: StorageBackend;
  private readonly config: SyncEngineOptions['config'];
  private localState: LocalSyncState | null;
  private readonly passphrase: string | undefined;

  constructor(options: SyncEngineOptions) {
    this.backend = options.backend;
    this.config = options.config;
    this.localState = options.localState;
    this.passphrase = options.passphrase;
  }

  /**
   * Perform a full sync - detect changes and push/pull/merge as needed.
   */
  public async sync(localData: CategoryData[]): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) {
      return buildErrorResult('No storage configured');
    }

    try {
      return await this.performSync(localData);
    } catch (error) {
      return handleSyncError(error);
    }
  }

  /**
   * Force push local data to remote.
   */
  public async push(localData: CategoryData[]): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) {
      return buildErrorResult('No storage configured');
    }

    try {
      return await this.performPush(localData);
    } catch (error) {
      if (error instanceof RepoConflictError) {
        return this.sync(localData);
      }
      throw error;
    }
  }

  /**
   * Pull remote data to local.
   */
  public async pull(remoteManifest?: Manifest): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) {
      return buildErrorResult('No storage configured');
    }

    try {
      return await this.performPull(remoteManifest);
    } catch (error) {
      return handleSyncError(error);
    }
  }

  /**
   * Get the current local state.
   */
  public getLocalState(): LocalSyncState | null {
    return this.localState;
  }

  /**
   * Initialize storage with empty manifest.
   */
  public async initializeStorage(): Promise<void> {
    const manifest = createEmptyManifest(this.config.machineId);
    await this.backend.initialize(JSON.stringify(manifest, null, 2));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private hasStorageConfigured(): boolean {
    return Boolean(this.config.repoOwner && this.config.repoName);
  }

  private getStorageId(): string {
    return `${this.config.repoOwner ?? ''}/${this.config.repoName ?? ''}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Sync Flow
  // ─────────────────────────────────────────────────────────────────────────

  private async performSync(localData: CategoryData[]): Promise<SyncResult> {
    const remoteManifest = await fetchManifest(this.backend);
    if (!remoteManifest) {
      return this.push(localData);
    }

    if (
      isLockedByOther(remoteManifest, this.config.machineId, this.config.advisoryLockTimeoutSeconds)
    ) {
      await this.sleep(2000);
    }

    return this.routeByClockComparison(localData, remoteManifest);
  }

  private async routeByClockComparison(
    localData: CategoryData[],
    remoteManifest: Manifest
  ): Promise<SyncResult> {
    const comparison = compareVectorClocks(
      this.localState?.vectorClock ?? {},
      remoteManifest.vectorClock
    );

    switch (comparison) {
      case 'equal':
        return this.handleInSync(localData, remoteManifest);
      case 'local-ahead':
        return this.push(localData);
      case 'remote-ahead':
        return this.pull(remoteManifest);
      case 'concurrent':
        return this.handleConflict(localData, remoteManifest);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Push
  // ─────────────────────────────────────────────────────────────────────────

  private async performPush(localData: CategoryData[]): Promise<SyncResult> {
    const { files, manifest, changedCategories } = preparePushData(
      localData,
      this.config,
      this.localState,
      this.passphrase
    );

    // Convert to storage format (add manifest)
    const storageFiles: Record<string, string | null> = {};
    for (const [filename, fileData] of Object.entries(files)) {
      storageFiles[filename] = fileData.content;
    }
    storageFiles[MANIFEST_FILENAME] = JSON.stringify(manifest, null, 2);

    await this.backend.updateFiles(storageFiles);

    this.localState = buildLocalState(
      manifest,
      localData,
      this.getStorageId(),
      this.config.machineId
    );

    return buildPushResult(changedCategories);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Pull
  // ─────────────────────────────────────────────────────────────────────────

  private async performPull(remoteManifest?: Manifest): Promise<SyncResult> {
    const manifest = remoteManifest ?? (await fetchManifest(this.backend));
    if (!manifest) {
      return buildErrorResult('No remote data found');
    }

    const storageFiles = await this.getStorageFilesMap();
    const { pulledData, changedCategories } = await pullCategories(
      manifest,
      storageFiles,
      this.config.sync,
      this.passphrase,
      this.backend
    );

    this.localState = buildLocalState(
      manifest,
      pulledData,
      this.getStorageId(),
      this.config.machineId
    );

    return buildPullResult(changedCategories);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Conflict Handling
  // ─────────────────────────────────────────────────────────────────────────

  private async handleInSync(
    localData: CategoryData[],
    remoteManifest: Manifest
  ): Promise<SyncResult> {
    if (needsPush(localData, remoteManifest.categories)) {
      return this.push(localData);
    }
    return buildNoChangeResult();
  }

  private async handleConflict(
    localData: CategoryData[],
    remoteManifest: Manifest
  ): Promise<SyncResult> {
    const storageFiles = await this.getStorageFilesMap();
    const { mergedData, conflicts } = await mergeAllCategories(localData, {
      remoteManifest,
      storageFiles,
      localState: this.localState,
      passphrase: this.passphrase,
      machineId: this.config.machineId,
      backend: this.backend,
    });

    const result = await this.push(mergedData);
    return buildConflictResult(result, conflicts);
  }

  private async getStorageFilesMap(): Promise<StorageFiles> {
    const files = await this.backend.listFiles();
    const map: StorageFiles = {};
    for (const file of files) {
      const entry: { content?: string; sha?: string } = {};
      if (file.content !== undefined) entry.content = file.content;
      if (file.sha !== undefined) entry.sha = file.sha;
      map[file.filename] = entry;
    }
    return map;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
