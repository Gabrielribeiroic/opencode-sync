/**
 * Data Packer
 *
 * Handles compression, chunking, and encoding of sync data.
 * - Compresses with gzip (pako)
 * - Chunks large data into ~800KB pieces
 * - Encodes as base64 for storage
 */

import * as pako from 'pako';
import type { PackedChunk, PackedCategory, SyncCategory } from '../types/index.js';
import {
  calculateChecksum,
  uint8ArrayToBase64,
  base64ToUint8Array,
  PackerError,
} from '../shared/index.js';

/** Maximum chunk size in bytes (800KB) */
const MAX_CHUNK_SIZE = 800 * 1024;

/**
 * Pack data for a category: compress, chunk, and encode.
 */
export function packCategory(category: SyncCategory, data: string): PackedCategory {
  const totalSize = Buffer.byteLength(data, 'utf8');

  // Compress with gzip
  const compressed = pako.gzip(data);
  const compressedSize = compressed.length;

  // Calculate checksum of original data
  const checksum = calculateChecksum(data);

  // Chunk if necessary
  const chunks = chunkData(category, compressed);

  return {
    category,
    chunks,
    totalSize,
    compressedSize,
    checksum,
  };
}

/**
 * Unpack data: decode, decompress, and validate.
 */
export function unpackCategory(chunks: PackedChunk[], expectedChecksum?: string): string {
  // Sort chunks by index
  const sortedChunks = [...chunks].sort((a, b) => a.index - b.index);

  // Combine chunks
  const combined = combineChunks(sortedChunks);

  // Decompress
  const decompressed = pako.ungzip(combined, { to: 'string' });

  // Validate checksum if provided
  if (expectedChecksum) {
    const actualChecksum = calculateChecksum(decompressed);
    if (actualChecksum !== expectedChecksum) {
      throw new PackerError(
        `Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`
      );
    }
  }

  return decompressed;
}

/**
 * Split compressed data into chunks.
 */
function chunkData(category: SyncCategory, compressed: Uint8Array): PackedChunk[] {
  const chunks: PackedChunk[] = [];
  const totalBytes = compressed.length;

  if (totalBytes <= MAX_CHUNK_SIZE) {
    // Single chunk
    chunks.push({
      index: 0,
      filename: `${category}.json.gz.b64`,
      content: uint8ArrayToBase64(compressed),
      size: totalBytes,
    });
  } else {
    // Multiple chunks
    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalBytes) {
      const end = Math.min(offset + MAX_CHUNK_SIZE, totalBytes);
      const chunkData = compressed.slice(offset, end);

      chunks.push({
        index: chunkIndex,
        filename: `${category}-${String(chunkIndex).padStart(3, '0')}.json.gz.b64`,
        content: uint8ArrayToBase64(chunkData),
        size: chunkData.length,
      });

      offset = end;
      chunkIndex++;
    }
  }

  return chunks;
}

/**
 * Combine base64-encoded chunks back into a Uint8Array.
 */
function combineChunks(chunks: PackedChunk[]): Uint8Array {
  const firstChunk = chunks[0];
  if (chunks.length === 1 && firstChunk) {
    return base64ToUint8Array(firstChunk.content);
  }

  // Calculate total size
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  const combined = new Uint8Array(totalSize);

  let offset = 0;
  for (const chunk of chunks) {
    const data = base64ToUint8Array(chunk.content);
    combined.set(data, offset);
    offset += data.length;
  }

  return combined;
}

/**
 * Compress a string with gzip and return base64.
 */
export function compress(data: string): string {
  const compressed = pako.gzip(data);
  return uint8ArrayToBase64(compressed);
}

/**
 * Decompress base64 gzip data to string.
 */
export function decompress(base64Data: string): string {
  const compressed = base64ToUint8Array(base64Data);
  return pako.ungzip(compressed, { to: 'string' });
}

// Re-export for backward compatibility
export {
  calculateChecksum,
  uint8ArrayToBase64,
  base64ToUint8Array,
  PackerError,
} from '../shared/index.js';
