/**
 * Sync Engine State Management
 *
 * Handles local state updates after sync operations.
 */

import { calculateChecksum } from '../packer.js';
import type { StorageBackend } from '../../storage/index.js';
import type { Manifest, LocalSyncState } from '../../types/index.js';
import type { CategoryData, StorageFiles } from '../operations/types.js';

/**
 * Build updated local state after a sync operation.
 */
export function buildLocalState(
  manifest: Manifest,
  data: CategoryData[],
  storageId: string,
  machineId: string
): LocalSyncState {
  const now = new Date().toISOString();
  const checksums: LocalSyncState['categoryChecksums'] = {};
  const baseVersions: LocalSyncState['baseVersions'] = {};

  for (const { category, data: content } of data) {
    checksums[category] = calculateChecksum(content);
    baseVersions[category] = content;
  }

  return {
    storageId,
    machineId,
    lastSyncedVersion: manifest.version,
    lastSyncedAt: now,
    vectorClock: manifest.vectorClock,
    categoryChecksums: checksums,
    baseVersions,
  };
}

/**
 * Check if another machine has an advisory lock.
 */
export function isLockedByOther(
  manifest: Manifest,
  machineId: string,
  timeoutSeconds: number
): boolean {
  if (!manifest.advisoryLock) return false;
  if (manifest.advisoryLock.machine === machineId) return false;

  const lockTime = new Date(manifest.advisoryLock.since).getTime();
  const timeout = timeoutSeconds * 1000;
  return Date.now() - lockTime < timeout;
}

/**
 * Build storage files map from backend listing.
 */
export async function getStorageFilesMap(backend: StorageBackend): Promise<StorageFiles> {
  const files = await backend.listFiles();
  const map: StorageFiles = {};
  for (const file of files) {
    const entry: { content?: string; sha?: string } = {};
    if (file.content !== undefined) entry.content = file.content;
    if (file.sha !== undefined) entry.sha = file.sha;
    map[file.filename] = entry;
  }
  return map;
}
