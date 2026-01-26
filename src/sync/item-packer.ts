/**
 * Item Packer
 *
 * Handles per-item compression, encoding, and hashing for granular sync.
 * Each item (session, message) is compressed and stored individually.
 */

import * as pako from 'pako';
import type { SyncCategory, ItemInfo } from '../types/index.js';
import { getItemFilename } from './item-filename.js';
import {
  calculateChecksum,
  uint8ArrayToBase64,
  base64ToUint8Array,
  ItemPackerError,
} from '../shared/index.js';

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

// Re-export for backward compatibility
export { getItemFilename, getItemIdFromFilename } from './item-filename.js';
export { diffItems, type ItemDiff } from './item-diff.js';
export { calculateChecksum, ItemPackerError } from '../shared/index.js';
