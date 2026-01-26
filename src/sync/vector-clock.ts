/**
 * Timestamp-Based Sync
 *
 * Simple last-write-wins conflict resolution using timestamps.
 * Replaces the previous vector clock approach for simplicity.
 */

import type { TimestampComparison } from '../types/index.js';

/**
 * Compare two ISO timestamps to determine sync direction.
 *
 * @returns
 * - 'equal': Timestamps are identical (use checksum as tiebreaker)
 * - 'local-newer': Local has more recent changes (safe to push)
 * - 'remote-newer': Remote has more recent changes (need to pull)
 */
export function compareTimestamps(
  localTimestamp: string | undefined,
  remoteTimestamp: string | undefined
): TimestampComparison {
  // No local timestamp means we haven't synced yet - need to pull
  if (!localTimestamp) {
    return remoteTimestamp ? 'remote-newer' : 'equal';
  }

  // No remote timestamp means remote is empty - safe to push
  if (!remoteTimestamp) {
    return 'local-newer';
  }

  const localTime = new Date(localTimestamp).getTime();
  const remoteTime = new Date(remoteTimestamp).getTime();

  if (localTime > remoteTime) {
    return 'local-newer';
  }
  if (remoteTime > localTime) {
    return 'remote-newer';
  }
  return 'equal';
}
