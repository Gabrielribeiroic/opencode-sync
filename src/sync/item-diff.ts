/**
 * Item Diff Utilities
 *
 * Compares local and remote items to determine sync actions.
 */

import type { ItemInfo } from '../types/index.js';

/**
 * Diff local items against remote manifest to find what needs to sync.
 */
export interface ItemDiff {
  /** Items that exist locally but not remotely (or have different checksum) */
  toUpload: string[];
  /** Items that exist remotely but not locally */
  toDownload: string[];
  /** Items that exist in both with same checksum (no action needed) */
  unchanged: string[];
}

export function diffItems(
  localChecksums: Record<string, string>,
  remoteItems: Record<string, ItemInfo>
): ItemDiff {
  const toUpload: string[] = [];
  const toDownload: string[] = [];
  const unchanged: string[] = [];

  // Check local items
  for (const [itemId, localChecksum] of Object.entries(localChecksums)) {
    const remoteItem = remoteItems[itemId];
    if (!remoteItem) {
      // Local only - needs upload
      toUpload.push(itemId);
    } else if (remoteItem.checksum !== localChecksum) {
      // Different checksum - local is newer, upload
      // (In real conflict resolution, we'd compare timestamps or vector clocks)
      toUpload.push(itemId);
    } else {
      // Same checksum - no change
      unchanged.push(itemId);
    }
  }

  // Check for remote-only items
  for (const itemId of Object.keys(remoteItems)) {
    if (!(itemId in localChecksums)) {
      toDownload.push(itemId);
    }
  }

  return { toUpload, toDownload, unchanged };
}
