/**
 * Sync Engine Operations
 *
 * Push, pull, and conflict resolution operations for the sync engine.
 */

import type { StorageBackend } from '../../storage/index.js';
import type { Manifest, SyncResult, LocalSyncState, SyncConfig } from '../../types/index.js';
import type { CategoryData } from '../operations/types.js';
import { pullCategories } from '../operations/pull.js';
import { mergeAllCategories } from '../operations/merge-operation.js';
import { syncLog } from '../../logging/index.js';
import { MANIFEST_FILENAME } from './types.js';
import { buildLocalState, mergeDataForState } from './state.js';
import {
  buildPushResult,
  buildPullResult,
  buildConflictResult,
  buildErrorResult,
} from './result.js';
import {
  buildPullOptions,
  executePush,
  toStorageFiles,
  buildCryptoOptions,
  extractTombstoneIds,
} from './helpers.js';

export interface OperationContext {
  backend: StorageBackend;
  config: SyncConfig;
  passphrase: string | undefined;
  oldPassphrase: string | undefined;
  getStorageId: () => string;
}

export interface PushContext extends OperationContext {
  localState: LocalSyncState | null;
}

/** Execute a push operation and return updated local state */
export async function executePushOperation(
  ctx: PushContext,
  data: CategoryData[],
  remote?: Manifest
): Promise<{ result: SyncResult; newState: LocalSyncState }> {
  const remoteFiles = await ctx.backend.listFiles();
  const existing = remoteFiles.map((f) => f.filename);

  // Build SHA map for comparison (filename -> git blob SHA)
  const remoteShas: Record<string, string> = {};
  for (const f of remoteFiles) {
    if (f.sha) remoteShas[f.filename] = f.sha;
  }

  const opts = {
    localData: data,
    config: ctx.config,
    localState: ctx.localState,
    passphrase: buildCryptoOptions(ctx.passphrase, ctx.oldPassphrase),
    existingFiles: existing,
    remoteShas,
  };
  const { files, manifest, changedCategories } = executePush(opts, remote);
  const fileCount = Object.keys(files).length;
  syncLog(`[SYNC] Push: ${String(fileCount)} files, ${String(existing.length)} existing`);
  await ctx.backend.updateFiles(
    toStorageFiles(files, MANIFEST_FILENAME, JSON.stringify(manifest, null, 2))
  );
  const newState = buildLocalState(manifest, data, ctx.getStorageId(), ctx.config.machineId);

  const result = buildPushResult({ changedCategories });
  return { result, newState };
}

/** Execute a pull operation and return updated local state */
export async function executePullOperation(
  ctx: PushContext,
  remote?: Manifest,
  data?: CategoryData[]
): Promise<{ result: SyncResult; newState: LocalSyncState | null }> {
  if (!remote) return { result: buildErrorResult('No remote data found'), newState: null };
  const opts = buildPullOptions(
    {
      manifest: remote,
      enabledCategories: ctx.config.sync,
      passphrase: buildCryptoOptions(ctx.passphrase, ctx.oldPassphrase),
      backend: ctx.backend,
    },
    data,
    ctx.localState
  );
  const { pulledData, changedCategories, tombstonedItems, remoteShas } = await pullCategories(opts);
  syncLog(`[SYNC] Pull: ${String(changedCategories.length)} categories`);
  const mergedData = mergeDataForState(data, pulledData);
  const newState = buildLocalState(remote, mergedData, ctx.getStorageId(), ctx.config.machineId);
  // Merge remote SHAs: keep existing ones and add/update from pull
  newState.remoteShas = {
    ...(ctx.localState?.remoteShas ?? {}),
    ...remoteShas,
  };
  const tombstoneIds = extractTombstoneIds(tombstonedItems);
  return {
    result: buildPullResult({ changedCategories, pulledData, tombstonedItems: tombstoneIds }),
    newState,
  };
}

export interface ConflictContext extends PushContext {
  pushFn: (data: CategoryData[], retry: number, manifest: Manifest) => Promise<SyncResult>;
}

/** Handle conflict by merging and pushing */
export async function executeConflictOperation(
  ctx: ConflictContext,
  data: CategoryData[],
  manifest: Manifest,
  retry: number
): Promise<SyncResult> {
  const mergeCtx = {
    remoteManifest: manifest,
    localState: ctx.localState,
    passphrase: buildCryptoOptions(ctx.passphrase, ctx.oldPassphrase),
    machineId: ctx.config.machineId,
    backend: ctx.backend,
  };
  const { mergedData, conflicts } = mergeAllCategories(data, mergeCtx);
  return buildConflictResult(await ctx.pushFn(mergedData, retry, manifest), conflicts);
}
