/**
 * Encoding Utilities
 *
 * Shared functions for encoding, decoding, and checksum calculation.
 * Used by packer.ts and item-packer.ts for data serialization.
 */

import { createHash } from 'node:crypto';

/**
 * Calculate SHA-256 checksum of data.
 */
export function calculateChecksum(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Convert Uint8Array to base64 string.
 */
export function uint8ArrayToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

/**
 * Convert base64 string to Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}
