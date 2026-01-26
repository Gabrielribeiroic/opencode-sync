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
import type { CategoryData, PassphraseOption } from '../operations/types.js';
import type { PullOptions } from '../operations/pull.js';
import type { PreparePushResult } from '../operations/push.js';
import { preparePushData } from '../operations/push.js';

/**
 * Build checksums map from local category data for merge-based pull.
 * All categories use per-item sync.
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
    checksums[catData.category] = catData.checksums;
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
export function executePush(opts: PushOptsBase, remoteManifest?: Manifest): PreparePushResult {
  const pushOpts = { ...opts } as Parameters<typeof preparePushData>[0];
  if (remoteManifest) {
    pushOpts.remoteManifest = remoteManifest;
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
