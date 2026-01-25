/**
 * Sync Engine Helpers
 *
 * Helper functions for sync engine operations.
 */

import type {
  SyncCategory,
  Manifest,
  LocalSyncState,
  SyncConfig,
  Tombstone,
} from '../../types/index.js';
import { isShardedRef } from '../../types/index.js';
import type { CategoryData, PassphraseOption, ResolvedShard } from '../operations/types.js';
import { isItemCategoryData } from '../operations/types.js';
import type { PullOptions } from '../operations/pull.js';
import type { PreparePushResult } from '../operations/push.js';
import { preparePushData } from '../operations/push.js';
import type { StorageBackend } from '../../storage/index.js';
import { fetchCategoryShard } from './manifest.js';
import { syncLog } from './logger.js';

/**
 * Build checksums map from local item category data for merge-based pull.
 */
export function buildLocalChecksums(
  localData?: CategoryData[]
): Record<SyncCategory, Record<string, string>> | undefined {
  if (!localData) return undefined;

  const checksums: Record<SyncCategory, Record<string, string>> = {} as Record<
    SyncCategory,
    Record<string, string>
  >;

  for (const catData of localData) {
    if (isItemCategoryData(catData)) {
      checksums[catData.category] = catData.checksums;
    }
  }

  return Object.keys(checksums).length > 0 ? checksums : undefined;
}

/**
 * Build pull options, conditionally including localChecksums.
 */
export function buildPullOptions(
  base: Omit<PullOptions, 'localChecksums'>,
  localData?: CategoryData[]
): PullOptions {
  const localChecksums = buildLocalChecksums(localData);
  if (localChecksums) {
    return { ...base, localChecksums };
  }
  return base;
}

/** Build push options with conditional remoteManifest */
export interface PushOptsBase {
  localData: CategoryData[];
  config: SyncConfig;
  localState: LocalSyncState | null;
  passphrase: PassphraseOption;
  existingFiles: string[];
}

/** Execute push and return files for storage */
export function executePush(
  opts: PushOptsBase,
  remoteManifest?: Manifest,
  resolvedShards?: Record<SyncCategory, ResolvedShard>
): PreparePushResult {
  const pushOpts = { ...opts } as Parameters<typeof preparePushData>[0];
  if (remoteManifest) {
    pushOpts.remoteManifest = remoteManifest;
  }
  if (resolvedShards) {
    pushOpts.resolvedShards = resolvedShards;
  }
  return preparePushData(pushOpts);
}

/** Convert push files to storage format */
export function toStorageFiles(
  files: Record<string, { content: string | null }>,
  manifestFilename: string,
  manifestContent: string
): Record<string, string | null> {
  const storageFiles: Record<string, string | null> = {};
  for (const [filename, fileData] of Object.entries(files)) {
    storageFiles[filename] = fileData.content;
  }
  storageFiles[manifestFilename] = manifestContent;
  return storageFiles;
}

/** Build crypto options from passphrase fields */
export function buildCryptoOptions(
  passphrase?: string,
  oldPassphrase?: string
): { passphrase?: string; oldPassphrase?: string } {
  const r: { passphrase?: string; oldPassphrase?: string } = {};
  if (passphrase) r.passphrase = passphrase;
  if (oldPassphrase) r.oldPassphrase = oldPassphrase;
  return r;
}

/** Extract item IDs from tombstone records for SyncResult */
export function extractTombstoneIds(
  tombstonedItems: Record<SyncCategory, Record<string, Tombstone>>
): Partial<Record<SyncCategory, string[]>> {
  const result: Partial<Record<SyncCategory, string[]>> = {};
  for (const [cat, tombstones] of Object.entries(tombstonedItems)) {
    const ids = Object.keys(tombstones);
    if (ids.length > 0) {
      result[cat as SyncCategory] = ids;
    }
  }
  return result;
}

/**
 * Fetch resolved shard data for sharded categories.
 * This ensures we merge with existing remote data instead of overwriting.
 */
export async function fetchResolvedShards(
  backend: StorageBackend,
  remote?: Manifest
): Promise<Record<SyncCategory, ResolvedShard> | undefined> {
  if (!remote) return undefined;

  const shardedCategories: SyncCategory[] = ['sessions', 'messages'];
  const resolved: Record<SyncCategory, ResolvedShard> = {} as Record<SyncCategory, ResolvedShard>;
  let hasAny = false;

  for (const category of shardedCategories) {
    const info = remote.categories[category];
    if (info && isShardedRef(info)) {
      syncLog(`[PUSH] Fetching shard for ${category}: ${info.shardFile}`);
      const shard = await fetchCategoryShard(backend, info.shardFile);
      if (shard) {
        resolved[category] = {
          items: shard.items,
          tombstones: shard.tombstones,
        };
        hasAny = true;
        syncLog(
          `[PUSH] Loaded ${String(Object.keys(shard.items).length)} remote ${category} for merge`
        );
      }
    }
  }

  return hasAny ? resolved : undefined;
}
