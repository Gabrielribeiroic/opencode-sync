/**
 * Sync Engine - Core orchestration for push/pull operations.
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
import type { CategoryData } from '../operations/types.js';
import type { SyncEngineOptions } from './types.js';
import { MANIFEST_FILENAME } from './types.js';
import { fetchManifest } from './manifest.js';
import { buildLocalState, isLockedByOther, getStorageFilesMap } from './state.js';
import {
  buildPushResult,
  buildPullResult,
  buildConflictResult,
  buildErrorResult,
  buildNoChangeResult,
  buildSkippedResult,
  handleSyncError,
} from './result.js';
import { checkMaxRetries, calculateBackoff, sleep } from './retry.js';
import { acquireLock, releaseLock, getLockHolder } from '../local-lock.js';

export { type CategoryData };

export class SyncEngine {
  private readonly backend: StorageBackend;
  private readonly config: SyncEngineOptions['config'];
  private localState: LocalSyncState | null;
  private readonly passphrase: string | undefined;
  private readonly oldPassphrase: string | undefined;
  private readonly lockPath: string | undefined;

  constructor(options: SyncEngineOptions) {
    this.backend = options.backend;
    this.config = options.config;
    this.localState = options.localState;
    this.passphrase = options.passphrase;
    this.oldPassphrase = options.oldPassphrase;
    this.lockPath = options.lockPath;
  }

  /** Get crypto options for encryption/decryption with key rotation support */
  private getCryptoOptions(): { passphrase?: string; oldPassphrase?: string } {
    const result: { passphrase?: string; oldPassphrase?: string } = {};
    if (this.passphrase) result.passphrase = this.passphrase;
    if (this.oldPassphrase) result.oldPassphrase = this.oldPassphrase;
    return result;
  }

  public async sync(localData: CategoryData[]): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) return buildErrorResult('No storage configured');

    // Acquire local lock to prevent concurrent syncs on same machine
    if (this.lockPath && !acquireLock(this.lockPath, 'sync')) {
      const holder = getLockHolder(this.lockPath);
      return buildSkippedResult(`Another instance is syncing${holder ? ` (${holder})` : ''}`);
    }

    try {
      return await this.performSync(localData);
    } catch (error) {
      return handleSyncError(error);
    } finally {
      if (this.lockPath) releaseLock(this.lockPath);
    }
  }

  public async push(localData: CategoryData[], retryCount = 0): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) return buildErrorResult('No storage configured');
    try {
      return await this.performPush(localData);
    } catch (error) {
      if (error instanceof RepoConflictError) {
        const maxError = checkMaxRetries(retryCount);
        if (maxError) return maxError;
        await sleep(calculateBackoff(retryCount));
        return this.syncWithRetry(localData, retryCount + 1);
      }
      throw error;
    }
  }

  public async pull(remoteManifest?: Manifest): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) return buildErrorResult('No storage configured');
    try {
      return await this.performPull(remoteManifest);
    } catch (error) {
      return handleSyncError(error);
    }
  }

  public getLocalState(): LocalSyncState | null {
    return this.localState;
  }

  public async initializeStorage(): Promise<void> {
    const manifest = createEmptyManifest(this.config.machineId);
    await this.backend.initialize(JSON.stringify(manifest, null, 2));
  }

  private hasStorageConfigured(): boolean {
    return Boolean(this.config.repoOwner && this.config.repoName);
  }

  private getStorageId(): string {
    return `${this.config.repoOwner ?? ''}/${this.config.repoName ?? ''}`;
  }

  private async syncWithRetry(localData: CategoryData[], retryCount: number): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) return buildErrorResult('No storage configured');
    try {
      const remoteManifest = await fetchManifest(this.backend);
      if (!remoteManifest) return await this.push(localData, retryCount);
      const lockTimeout = this.config.advisoryLockTimeoutSeconds;
      if (isLockedByOther(remoteManifest, this.config.machineId, lockTimeout)) await sleep(2000);
      return await this.routeByClockComparison(localData, remoteManifest, retryCount);
    } catch (error) {
      return handleSyncError(error);
    }
  }

  private async performSync(localData: CategoryData[]): Promise<SyncResult> {
    const remoteManifest = await fetchManifest(this.backend);
    if (!remoteManifest) return this.push(localData);
    const lockTimeout = this.config.advisoryLockTimeoutSeconds;
    if (isLockedByOther(remoteManifest, this.config.machineId, lockTimeout)) await sleep(2000);
    return this.routeByClockComparison(localData, remoteManifest, 0);
  }

  private async routeByClockComparison(
    localData: CategoryData[],
    remoteManifest: Manifest,
    retryCount: number
  ): Promise<SyncResult> {
    const comparison = compareVectorClocks(
      this.localState?.vectorClock ?? {},
      remoteManifest.vectorClock
    );
    switch (comparison) {
      case 'equal':
        if (needsPush(localData, remoteManifest.categories))
          return this.push(localData, retryCount);
        return buildNoChangeResult();
      case 'local-ahead':
        return this.push(localData, retryCount);
      case 'remote-ahead':
        return this.pull(remoteManifest);
      case 'concurrent':
        return this.handleConflict(localData, remoteManifest, retryCount);
    }
  }

  private async performPush(localData: CategoryData[]): Promise<SyncResult> {
    const existingFilesList = await this.backend.listFiles();
    const existingFilenames = existingFilesList.map((f) => f.filename);
    const { files, manifest, changedCategories } = preparePushData(
      localData,
      this.config,
      this.localState,
      this.getCryptoOptions(),
      existingFilenames
    );
    const storageFiles: Record<string, string | null> = {};
    for (const [filename, fileData] of Object.entries(files))
      storageFiles[filename] = fileData.content;
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

  private async performPull(remoteManifest?: Manifest): Promise<SyncResult> {
    const manifest = remoteManifest ?? (await fetchManifest(this.backend));
    if (!manifest) return buildErrorResult('No remote data found');
    const storageFiles = await getStorageFilesMap(this.backend);
    const { pulledData, changedCategories } = await pullCategories(
      manifest,
      storageFiles,
      this.config.sync,
      this.getCryptoOptions(),
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

  private async handleConflict(
    localData: CategoryData[],
    remoteManifest: Manifest,
    retryCount: number
  ): Promise<SyncResult> {
    const storageFiles = await getStorageFilesMap(this.backend);
    const { mergedData, conflicts } = await mergeAllCategories(localData, {
      remoteManifest,
      storageFiles,
      localState: this.localState,
      passphrase: this.getCryptoOptions(),
      machineId: this.config.machineId,
      backend: this.backend,
    });
    const result = await this.push(mergedData, retryCount);
    return buildConflictResult(result, conflicts);
  }
}
