/**
 * Sync Engine State Management
 *
 * Handles local state updates after sync operations.
 */

import { calculateChecksum } from '../packer.js';
import type { Manifest, LocalSyncState } from '../../types/index.js';
import type { CategoryData } from '../operations/types.js';

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
