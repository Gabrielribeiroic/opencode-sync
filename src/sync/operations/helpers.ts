/**
 * Operation Helpers
 *
 * Shared helper functions for sync operations.
 */

import type { SyncHistoryEntry, Manifest } from '../../types/index.js';
import { MAX_SYNC_HISTORY } from '../../types/index.js';
import type { ItemInfo, Tombstone } from '../../types/manifest.js';
import { mergeTombstones, filterExpiredTombstones } from '../tombstone.js';
import type {
  LocalSyncState,
  SyncCategory,
  PushContext,
  PassphraseOption,
  PreparePushOptions,
} from './types.js';

// Re-export crypto helpers for backwards compatibility
export { maybeEncrypt, maybeDecrypt, parseEncryptedData } from './crypto-helpers.js';
export type { CryptoOptions } from './crypto-helpers.js';

/** Result of processing tombstones for push */
export interface TombstoneProcessResult {
  /** Cleaned tombstones (expired ones removed) */
  tombstones: Record<string, Tombstone>;
  /** Item IDs to remove from items map */
  itemsToRemove: string[];
  /** Filenames to mark for deletion */
  filesToDelete: string[];
}

/**
 * Process tombstones: merge local and remote, cleanup expired, identify items to remove.
 */
export function processTombstonesForPush(
  localTombstones: Record<string, Tombstone> | undefined,
  remoteTombstones: Record<string, Tombstone>,
  remoteItems: Record<string, ItemInfo>
): TombstoneProcessResult {
  const merged = mergeTombstones(localTombstones ?? {}, remoteTombstones);
  const { valid, expiredIds } = filterExpiredTombstones(merged, new Date());

  const itemsToRemove = Object.keys(valid);
  const filesToDelete: string[] = [];

  // Files for tombstoned items
  for (const itemId of itemsToRemove) {
    const info = remoteItems[itemId];
    if (info) filesToDelete.push(info.filename);
  }

  // Files for expired tombstones
  for (const itemId of expiredIds) {
    const info = remoteItems[itemId];
    if (info) filesToDelete.push(info.filename);
  }

  return { tombstones: valid, itemsToRemove, filesToDelete };
}

/**
 * Remove items by IDs from an items map (returns new map without mutating).
 */
export function removeItemsById(
  items: Record<string, ItemInfo>,
  idsToRemove: string[]
): Record<string, ItemInfo> {
  const result: Record<string, ItemInfo> = {};
  for (const [id, info] of Object.entries(items)) {
    if (!idsToRemove.includes(id)) {
      result[id] = info;
    }
  }
  return result;
}

/** Create base manifest structure (timestamp-based, no vector clocks). */
export function createManifest(
  now: string,
  localState: LocalSyncState | null,
  machineId: string
): Manifest {
  return {
    version: (localState?.lastSyncedVersion ?? 0) + 1,
    schemaVersion: '5.0',
    createdAt: localState?.lastSyncedAt ?? now,
    updatedAt: now,
    lastUpdatedBy: machineId,
    categories: {},
    recentSyncs: [],
  };
}

/** Add sync history entry to manifest. */
export function addSyncHistory(ctx: PushContext, categories: SyncCategory[]): void {
  const entry: SyncHistoryEntry = {
    machine: ctx.machineId,
    timestamp: ctx.now,
    action: 'push',
    categoriesAffected: categories,
  };
  ctx.manifest.recentSyncs = [entry].slice(0, MAX_SYNC_HISTORY);
}

/** Files that should never be marked as orphaned */
const PROTECTED_FILES = new Set(['manifest.json', 'tombstones.json']);

/** Mark orphaned files for deletion. */
export function markOrphanedFiles(
  files: Record<string, { content: string | null }>,
  existingFiles: string[] | undefined,
  newFiles: Set<string>
): void {
  if (!existingFiles) return;
  for (const filename of existingFiles) {
    if (!PROTECTED_FILES.has(filename) && !newFiles.has(filename)) {
      files[filename] = { content: null };
    }
  }
}

/** Build push context with manifest (timestamp-based). */
export function buildPushContext(
  config: PreparePushOptions['config'],
  localState: LocalSyncState | null,
  passphrase: PassphraseOption
): PushContext {
  const now = new Date().toISOString();
  const machineId = config.machineId;
  return {
    files: {},
    manifest: createManifest(now, localState, machineId),
    now,
    machineId,
    config: config as PushContext['config'],
    localState,
    passphrase,
  };
}
