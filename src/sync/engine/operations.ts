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
import { syncLog } from './logger.js';
import { MANIFEST_FILENAME } from './types.js';
import { buildLocalState, getStorageFilesMap, mergeDataForState } from './state.js';
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
  fetchResolvedShards,
} from './helpers.js';
import { fetchRemoteItemsNotLocal } from './remote-fetch.js';

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
): Promise<{ result: SyncResult; newState: LocalSyncState; remoteItems?: CategoryData[] }> {
  const existing = (await ctx.backend.listFiles()).map((f) => f.filename);

  // Pre-fetch shards for sharded categories to enable proper merging
  const resolvedShards = await fetchResolvedShards(ctx.backend, remote);

  const opts = {
    localData: data,
    config: ctx.config,
    localState: ctx.localState,
    passphrase: buildCryptoOptions(ctx.passphrase, ctx.oldPassphrase),
    existingFiles: existing,
  };
  const { files, manifest, changedCategories } = executePush(opts, remote, resolvedShards);
  const fileCount = Object.keys(files).length;
  syncLog(`[SYNC] Push: ${String(fileCount)} files, ${String(existing.length)} existing`);
  await ctx.backend.updateFiles(
    toStorageFiles(files, MANIFEST_FILENAME, JSON.stringify(manifest, null, 2))
  );
  const newState = buildLocalState(manifest, data, ctx.getStorageId(), ctx.config.machineId);

  // Fetch remote items we don't have locally (for writing to disk)
  const remoteItems = resolvedShards
    ? await fetchRemoteItemsNotLocal(ctx.backend, resolvedShards, data)
    : undefined;

  const result = buildPushResult({
    changedCategories,
    pulledData: remoteItems && remoteItems.length > 0 ? remoteItems : undefined,
  });

  // Only include remoteItems in return if there are any
  if (remoteItems && remoteItems.length > 0) {
    return { result, newState, remoteItems };
  }
  return { result, newState };
}

/** Execute a pull operation and return updated local state */
export async function executePullOperation(
  ctx: OperationContext,
  remote?: Manifest,
  data?: CategoryData[]
): Promise<{ result: SyncResult; newState: LocalSyncState | null }> {
  if (!remote) return { result: buildErrorResult('No remote data found'), newState: null };
  const sf = await getStorageFilesMap(ctx.backend);
  const opts = buildPullOptions(
    {
      manifest: remote,
      storageFiles: sf,
      enabledCategories: ctx.config.sync,
      passphrase: buildCryptoOptions(ctx.passphrase, ctx.oldPassphrase),
      backend: ctx.backend,
    },
    data
  );
  const { pulledData, changedCategories, tombstonedItems } = await pullCategories(opts);
  syncLog(`[SYNC] Pull: ${String(changedCategories.length)} categories`);
  const mergedData = mergeDataForState(data, pulledData);
  const newState = buildLocalState(remote, mergedData, ctx.getStorageId(), ctx.config.machineId);
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
  const sf = await getStorageFilesMap(ctx.backend);
  const mergeCtx = {
    remoteManifest: manifest,
    storageFiles: sf,
    localState: ctx.localState,
    passphrase: buildCryptoOptions(ctx.passphrase, ctx.oldPassphrase),
    machineId: ctx.config.machineId,
    backend: ctx.backend,
  };
  const { mergedData, conflicts } = await mergeAllCategories(data, mergeCtx);
  return buildConflictResult(await ctx.pushFn(mergedData, retry, manifest), conflicts);
}
