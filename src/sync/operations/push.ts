/**
 * Push Operation
 *
 * Handles pushing local data to remote storage.
 */

import { packCategory, calculateChecksum } from '../packer.js';
import { incrementClock } from '../vector-clock.js';
import { maybeEncrypt } from './helpers.js';
import { MAX_SYNC_HISTORY, type SyncHistoryEntry } from '../../types/index.js';
import type {
  CategoryData,
  PushContext,
  Manifest,
  LocalSyncState,
  SyncCategory,
  PassphraseOption,
} from './types.js';

/**
 * Prepare all data for pushing to remote.
 * @param existingFiles - List of existing filenames in storage (for cleanup of orphaned chunks)
 */
export function preparePushData(
  localData: CategoryData[],
  config: { machineId: string; sync: Record<SyncCategory, boolean> },
  localState: LocalSyncState | null,
  passphrase: PassphraseOption,
  existingFiles?: string[]
): {
  files: Record<string, { content: string | null }>;
  manifest: Manifest;
  changedCategories: SyncCategory[];
} {
  const files: Record<string, { content: string | null }> = {};
  const now = new Date().toISOString();
  const machineId = config.machineId;
  const newClock = incrementClock(localState?.vectorClock ?? {}, machineId);
  const manifest = createManifest(now, newClock, localState, machineId);
  const changedCategories: SyncCategory[] = [];
  const newChunkFiles = new Set<string>();
  const ctx: PushContext = {
    files,
    manifest,
    now,
    machineId,
    newClock,
    config: config as PushContext['config'],
    localState,
    passphrase,
  };

  for (const { category, data } of localData) {
    if (!config.sync[category]) continue;
    const chunkFilenames = packCategoryData(category, data, ctx);
    for (const f of chunkFilenames) newChunkFiles.add(f);
    changedCategories.push(category);
  }

  // Mark orphaned chunk files for deletion (e.g., when data shrinks)
  if (existingFiles) {
    for (const filename of existingFiles) {
      // Only delete chunk files (category-NNN.json.gz.b64), not manifest
      if (filename !== 'manifest.json' && !newChunkFiles.has(filename)) {
        files[filename] = { content: null };
      }
    }
  }

  addSyncHistory(ctx, changedCategories);
  return { files, manifest, changedCategories };
}

/**
 * Create base manifest structure.
 */
function createManifest(
  now: string,
  newClock: Record<string, number>,
  localState: LocalSyncState | null,
  machineId: string
): Manifest {
  return {
    version: (localState?.lastSyncedVersion ?? 0) + 1,
    schemaVersion: '1.0',
    createdAt: localState?.lastSyncedAt ?? now,
    updatedAt: now,
    lastUpdatedBy: machineId,
    vectorClock: newClock,
    categories: {},
    recentSyncs: [],
  };
}

/**
 * Pack and add category data to files and manifest.
 * Returns list of chunk filenames created.
 */
function packCategoryData(category: SyncCategory, data: string, ctx: PushContext): string[] {
  const dataToStore = maybeEncrypt(category, data, ctx.passphrase);
  const packed = packCategory(category, dataToStore);

  for (const chunk of packed.chunks) {
    ctx.files[chunk.filename] = { content: chunk.content };
  }

  ctx.manifest.categories[category] = {
    files: packed.chunks.map((c) => c.filename),
    totalSize: packed.totalSize,
    compressedSize: packed.compressedSize,
    checksum: packed.checksum,
    lastModified: ctx.now,
    lastModifiedBy: ctx.machineId,
    vectorClock: { [ctx.machineId]: ctx.newClock[ctx.machineId] ?? 1 },
  };

  return packed.chunks.map((c) => c.filename);
}

/**
 * Add sync history entry to manifest.
 */
function addSyncHistory(ctx: PushContext, categories: SyncCategory[]): void {
  const entry: SyncHistoryEntry = {
    machine: ctx.machineId,
    timestamp: ctx.now,
    action: 'push',
    categoriesAffected: categories,
  };
  ctx.manifest.recentSyncs = [entry].slice(0, MAX_SYNC_HISTORY);
}

/**
 * Check if local data needs pushing by comparing checksums.
 */
export function needsPush(
  localData: CategoryData[],
  remoteCategories: Record<string, { checksum: string }>
): boolean {
  for (const { category, data } of localData) {
    const localChecksum = calculateChecksum(data);
    const remoteInfo = remoteCategories[category];
    if (localChecksum !== remoteInfo?.checksum) {
      return true;
    }
  }
  return false;
}
