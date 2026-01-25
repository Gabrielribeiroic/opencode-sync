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
 *
 * Item IDs come from category-loader.ts in format: {type}/{parent}/{file}.json
 * We transform these to a hierarchical structure for remote storage:
 * - Sessions: session/{projectHash}/{sessionId}.json → sessions/{projectHash}/{sessionId}.json.gz
 * - Messages: message/{sessionId}/{messageId}.json → messages/{sessionId}/{messageId}.json.gz
 * - Parts:    part/{messageId}/{partId}.json → messages/parts/{messageId}/{partId}.json.gz
 */
export function getItemFilename(category: SyncCategory, itemId: string): string {
  if (category === 'sessions') {
    // itemId: session/{projectHash}/{sessionId}.json
    // Output: sessions/{projectHash}/{sessionId}.json.gz
    const match = /^session\/([^/]+)\/(.+)\.json$/.exec(itemId);
    if (match?.[1] && match[2]) {
      return `sessions/${match[1]}/${match[2]}.json.gz`;
    }
  }

  if (category === 'messages') {
    // Message: message/{sessionId}/{messageId}.json
    // Output: messages/{sessionId}/{messageId}.json.gz
    const msgMatch = /^message\/(ses_[^/]+)\/(.+)\.json$/.exec(itemId);
    if (msgMatch?.[1] && msgMatch[2]) {
      return `messages/${msgMatch[1]}/${msgMatch[2]}.json.gz`;
    }

    // Part: part/{messageId}/{partId}.json
    // Output: messages/parts/{messageId}/{partId}.json.gz
    const partMatch = /^part\/(msg_[^/]+)\/(.+)\.json$/.exec(itemId);
    if (partMatch?.[1] && partMatch[2]) {
      return `messages/parts/${partMatch[1]}/${partMatch[2]}.json.gz`;
    }
  }

  // Fallback: flat structure (replace path separators and unsafe chars)
  const safeId = itemId.replace(/[/\\:*?"<>|]/g, '_').replace(/\.json$/, '');
  return `${category}/${safeId}.json.gz`;
}

/**
 * Extract item ID from filename.
 *
 * Reverses the hierarchical remote path back to the original item ID format
 * used by category-loader.ts.
 */
export function getItemIdFromFilename(filename: string): string | null {
  // Sessions: sessions/{projectHash}/{sessionId}.json.gz -> session/{projectHash}/{sessionId}.json
  const sessionMatch = /^sessions\/([^/]+)\/([^/]+)\.json\.gz$/.exec(filename);
  if (sessionMatch?.[1] && sessionMatch[2]) {
    return `session/${sessionMatch[1]}/${sessionMatch[2]}.json`;
  }

  // Messages: messages/{sessionId}/{messageId}.json.gz -> message/{sessionId}/{messageId}.json
  const msgMatch = /^messages\/(ses_[^/]+)\/([^/]+)\.json\.gz$/.exec(filename);
  if (msgMatch?.[1] && msgMatch[2]) {
    return `message/${msgMatch[1]}/${msgMatch[2]}.json`;
  }

  // Parts: messages/parts/{messageId}/{partId}.json.gz -> part/{messageId}/{partId}.json
  const partMatch = /^messages\/parts\/(msg_[^/]+)\/([^/]+)\.json\.gz$/.exec(filename);
  if (partMatch?.[1] && partMatch[2]) {
    return `part/${partMatch[1]}/${partMatch[2]}.json`;
  }

  // Fallback: old flat format - restore slashes from underscores and add .json
  const fallbackMatch = /^[^/]+\/(.+)\.json\.gz$/.exec(filename);
  if (fallbackMatch?.[1]) {
    return fallbackMatch[1].replace(/_/g, '/') + '.json';
  }
  return null;
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
