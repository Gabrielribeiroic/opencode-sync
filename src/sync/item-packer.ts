/**
 * Item Packer
 *
 * Handles per-item compression, encoding, and hashing for granular sync.
 * Each item (session, message) is compressed and stored individually.
 */

import * as pako from 'pako';
import { createHash } from 'node:crypto';
import type { SyncCategory, ItemInfo } from '../types/index.js';

/** Result of packing a single item */
export interface PackedItem {
  /** Unique item ID (e.g., session ID, message path) */
  itemId: string;
  /** Filename in storage */
  filename: string;
  /** Compressed and base64-encoded content */
  content: string;
  /** SHA-256 of uncompressed content */
  checksum: string;
  /** Size of compressed content */
  size: number;
}

/** Result of unpacking a single item */
export interface UnpackedItem {
  itemId: string;
  /** Decompressed content (JSON string) */
  content: string;
  checksum: string;
}

/**
 * Pack a single item: compress and encode.
 */
export function packItem(
  category: SyncCategory,
  itemId: string,
  data: string,
  _machineId: string
): PackedItem {
  const checksum = calculateChecksum(data);
  const compressed = pako.gzip(data);
  const content = uint8ArrayToBase64(compressed);
  const filename = getItemFilename(category, itemId);

  return {
    itemId,
    filename,
    content,
    checksum,
    size: compressed.length,
  };
}

/**
 * Unpack a single item: decode and decompress.
 */
export function unpackItem(
  itemId: string,
  content: string,
  expectedChecksum?: string
): UnpackedItem {
  const compressed = base64ToUint8Array(content);
  const decompressed = pako.ungzip(compressed, { to: 'string' });

  const actualChecksum = calculateChecksum(decompressed);
  if (expectedChecksum && actualChecksum !== expectedChecksum) {
    throw new ItemPackerError(
      `Checksum mismatch for ${itemId}: expected ${expectedChecksum}, got ${actualChecksum}`
    );
  }

  return {
    itemId,
    content: decompressed,
    checksum: actualChecksum,
  };
}

/**
 * Calculate SHA-256 checksum of data.
 */
export function calculateChecksum(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Generate filename for an item in storage.
 */
export function getItemFilename(category: SyncCategory, itemId: string): string {
  // Sanitize item ID for filename (replace unsafe chars)
  const safeId = itemId.replace(/[/\\:*?"<>|]/g, '_');
  return `${category}/${safeId}.json.gz`;
}

/**
 * Extract item ID from filename.
 */
export function getItemIdFromFilename(filename: string): string | null {
  const regex = /^[^/]+\/(.+)\.json\.gz$/;
  const match = regex.exec(filename);
  return match ? (match[1] ?? null) : null;
}

/**
 * Build ItemInfo for manifest.
 */
export function buildItemInfo(packed: PackedItem, machineId: string): ItemInfo {
  return {
    filename: packed.filename,
    checksum: packed.checksum,
    size: packed.size,
    lastModified: new Date().toISOString(),
    lastModifiedBy: machineId,
  };
}

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

/**
 * Convert Uint8Array to base64 string.
 */
function uint8ArrayToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

/**
 * Convert base64 string to Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Error thrown when item packing/unpacking fails.
 */
export class ItemPackerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ItemPackerError';
  }
}
