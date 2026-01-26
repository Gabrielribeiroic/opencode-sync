import type { StorageBackend } from '../../storage/index.js';
import { RepoConflictError } from '../../storage/index.js';
import { syncLog } from './logger.js';
import {
  createEmptyManifest,
  type Manifest,
  type SyncResult,
  type LocalSyncState,
} from '../../types/index.js';
import type { CategoryData } from '../operations/types.js';
import type { SyncEngineOptions } from './types.js';
import { fetchManifest } from './manifest.js';
import { isLockedByOther } from './state.js';
import { buildErrorResult, buildSkippedResult, handleSyncError } from './result.js';
import { checkMaxRetries, calculateBackoff, sleep } from './retry.js';
import { acquireLock, releaseLock, getLockHolder } from '../local-lock.js';
import { determineAction, executeRoute } from './routing.js';
import {
  executePushOperation,
  executePullOperation,
  executeConflictOperation,
  type PushContext,
} from './operations.js';
import { pullThenPush } from './pull-push.js';

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
    const manifest = createEmptyManifest(this.config.machineId);
    await this.backend.initialize(JSON.stringify(manifest, null, 2));
  }

  private hasStorageConfigured(): boolean {
    return Boolean(this.config.repoOwner && this.config.repoName);
  }

  private getOperationContext(): PushContext {
    const storageId = `${this.config.repoOwner ?? ''}/${this.config.repoName ?? ''}`;
    return {
      backend: this.backend,
      config: this.config,
      passphrase: this.passphrase,
      oldPassphrase: this.oldPassphrase,
      getStorageId: () => storageId,
      localState: this.localState,
    };
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
      pull: () => this.doPullThenPush(m, d, r),
      conflict: () => this.handleConflict(d, m, r),
    });
  }

  private async doPullThenPush(
    manifest: Manifest,
    data: CategoryData[],
    retry: number
  ): Promise<SyncResult> {
    return pullThenPush(
      {
        backend: this.backend,
        performPull: (m, d) => this.performPull(m, d),
        push: (d, r, m) => this.push(d, r, m),
      },
      manifest,
      data,
      retry
    );
  }

  private async performPush(data: CategoryData[], remote?: Manifest): Promise<SyncResult> {
    const { result, newState } = await executePushOperation(
      this.getOperationContext(),
      data,
      remote
    );
    this.localState = newState;
    return result;
  }

  private async performPull(remote?: Manifest, data?: CategoryData[]): Promise<SyncResult> {
    const m = remote ?? (await fetchManifest(this.backend));
    const { result, newState } = await executePullOperation(
      this.getOperationContext(),
      m ?? undefined,
      data
    );
    if (newState) this.localState = newState;
    return result;
  }

  private async handleConflict(
    data: CategoryData[],
    m: Manifest,
    retry: number
  ): Promise<SyncResult> {
    const ctx = {
      ...this.getOperationContext(),
      pushFn: (d: CategoryData[], r: number, man: Manifest) => this.push(d, r, man),
    };
    return executeConflictOperation(ctx, data, m, retry);
  }
}
