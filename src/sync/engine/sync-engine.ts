import type { StorageBackend } from '../../storage/index.js';
import { RepoConflictError } from '../../storage/index.js';
import { syncLog } from './logger.js';
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
import {
  buildLocalState,
  isLockedByOther,
  getStorageFilesMap,
  mergeDataForState,
} from './state.js';
import {
  buildPushResult,
  buildPullResult,
  buildConflictResult,
  buildErrorResult,
  buildSkippedResult,
  handleSyncError,
} from './result.js';
import { checkMaxRetries, calculateBackoff, sleep } from './retry.js';
import { acquireLock, releaseLock, getLockHolder } from '../local-lock.js';
import {
  buildPullOptions,
  executePush,
  toStorageFiles,
  buildCryptoOptions,
  extractTombstoneIds,
} from './helpers.js';
import { determineAction, executeRoute } from './routing.js';

export { type CategoryData };

export class SyncEngine {
  private readonly backend: StorageBackend;
  private readonly config: SyncEngineOptions['config'];
  private localState: LocalSyncState | null;
  private readonly passphrase: string | undefined;
  private readonly oldPassphrase: string | undefined;
  private readonly lockPath: string | undefined;

  constructor(opts: SyncEngineOptions) {
    this.backend = opts.backend;
    this.config = opts.config;
    this.localState = opts.localState;
    this.passphrase = opts.passphrase;
    this.oldPassphrase = opts.oldPassphrase;
    this.lockPath = opts.lockPath;
  }

  public async sync(data: CategoryData[]): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) return buildErrorResult('No storage configured');
    if (this.lockPath && !acquireLock(this.lockPath, 'sync')) {
      const h = getLockHolder(this.lockPath);
      return buildSkippedResult(`Another instance is syncing${h ? ` (${h})` : ''}`);
    }
    try {
      return await this.performSync(data);
    } catch (e) {
      return handleSyncError(e);
    } finally {
      if (this.lockPath) releaseLock(this.lockPath);
    }
  }

  public async push(data: CategoryData[], retry = 0, manifest?: Manifest): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) return buildErrorResult('No storage configured');
    try {
      return await this.performPush(data, manifest);
    } catch (e) {
      if (e instanceof RepoConflictError) {
        const max = checkMaxRetries(retry);
        if (max) return max;
        await sleep(calculateBackoff(retry));
        return this.syncWithRetry(data, retry + 1);
      }
      throw e;
    }
  }

  public async pull(manifest?: Manifest, data?: CategoryData[]): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) return buildErrorResult('No storage configured');
    try {
      return await this.performPull(manifest, data);
    } catch (e) {
      return handleSyncError(e);
    }
  }

  public getLocalState(): LocalSyncState | null {
    return this.localState;
  }

  public async initializeStorage(): Promise<void> {
    await this.backend.initialize(
      JSON.stringify(createEmptyManifest(this.config.machineId), null, 2)
    );
  }

  private hasStorageConfigured(): boolean {
    return Boolean(this.config.repoOwner && this.config.repoName);
  }
  private getStorageId(): string {
    return `${this.config.repoOwner ?? ''}/${this.config.repoName ?? ''}`;
  }

  private async syncWithRetry(data: CategoryData[], retry: number): Promise<SyncResult> {
    if (!this.hasStorageConfigured()) return buildErrorResult('No storage configured');
    try {
      const m = await fetchManifest(this.backend);
      if (!m) return await this.push(data, retry);
      if (isLockedByOther(m, this.config.machineId, this.config.advisoryLockTimeoutSeconds))
        await sleep(2000);
      return await this.routeByClockComparison(data, m, retry);
    } catch (e) {
      return handleSyncError(e);
    }
  }

  private async performSync(data: CategoryData[]): Promise<SyncResult> {
    const m = await fetchManifest(this.backend);
    syncLog(`[SYNC] Manifest: ${m ? 'found' : 'not found'}`);
    if (!m) return this.push(data);
    if (isLockedByOther(m, this.config.machineId, this.config.advisoryLockTimeoutSeconds))
      await sleep(2000);
    return this.routeByClockComparison(data, m, 0);
  }

  private async routeByClockComparison(
    d: CategoryData[],
    m: Manifest,
    r: number
  ): Promise<SyncResult> {
    const route = determineAction(this.localState, m, d);
    return executeRoute(route, {
      push: () => this.push(d, r, m),
      pull: () => this.pull(m, d),
      conflict: () => this.handleConflict(d, m, r),
    });
  }

  private async performPush(data: CategoryData[], remote?: Manifest): Promise<SyncResult> {
    const existing = (await this.backend.listFiles()).map((f) => f.filename);
    const opts = {
      localData: data,
      config: this.config,
      localState: this.localState,
      passphrase: buildCryptoOptions(this.passphrase, this.oldPassphrase),
      existingFiles: existing,
    };
    const { files, manifest, changedCategories } = executePush(opts, remote);
    const fileCount = Object.keys(files).length;
    syncLog(`[SYNC] Push: ${String(fileCount)} files, ${String(existing.length)} existing`);
    await this.backend.updateFiles(
      toStorageFiles(files, MANIFEST_FILENAME, JSON.stringify(manifest, null, 2))
    );
    this.localState = buildLocalState(manifest, data, this.getStorageId(), this.config.machineId);
    return buildPushResult(changedCategories);
  }

  private async performPull(remote?: Manifest, data?: CategoryData[]): Promise<SyncResult> {
    const m = remote ?? (await fetchManifest(this.backend));
    if (!m) return buildErrorResult('No remote data found');
    const sf = await getStorageFilesMap(this.backend);
    const opts = buildPullOptions(
      {
        manifest: m,
        storageFiles: sf,
        enabledCategories: this.config.sync,
        passphrase: buildCryptoOptions(this.passphrase, this.oldPassphrase),
        backend: this.backend,
      },
      data
    );
    const { pulledData, changedCategories, tombstonedItems } = await pullCategories(opts);
    syncLog(`[SYNC] Pull: ${String(changedCategories.length)} categories`);
    const mergedData = mergeDataForState(data, pulledData);
    this.localState = buildLocalState(m, mergedData, this.getStorageId(), this.config.machineId);
    const tombstoneIds = extractTombstoneIds(tombstonedItems);
    return buildPullResult({ changedCategories, pulledData, tombstonedItems: tombstoneIds });
  }

  private async handleConflict(
    data: CategoryData[],
    m: Manifest,
    retry: number
  ): Promise<SyncResult> {
    const sf = await getStorageFilesMap(this.backend);
    const ctx = {
      remoteManifest: m,
      storageFiles: sf,
      localState: this.localState,
      passphrase: buildCryptoOptions(this.passphrase, this.oldPassphrase),
      machineId: this.config.machineId,
      backend: this.backend,
    };
    const { mergedData, conflicts } = await mergeAllCategories(data, ctx);
    return buildConflictResult(await this.push(mergedData, retry, m), conflicts);
  }
}
