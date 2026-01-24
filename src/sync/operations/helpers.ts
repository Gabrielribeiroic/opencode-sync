/**
 * Operation Helpers
 *
 * Shared helper functions for sync operations.
 */

import type { EncryptedData } from '../../types/index.js';
import { encrypt, decrypt, isEncryptedData } from '../../crypto/encrypt.js';

/**
 * Encrypt data if it's for credentials and passphrase is provided.
 */
export function maybeEncrypt(
  category: string,
  data: string,
  passphrase: string | undefined
): string {
  if (category !== 'credentials' || !passphrase) {
    return data;
  }
  const encrypted = encrypt(data, passphrase);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt data if it's for credentials and passphrase is provided.
 */
export function maybeDecrypt(
  category: string,
  data: string,
  passphrase: string | undefined
): string {
  if (category !== 'credentials' || !passphrase) {
    return data;
  }
  const parsed: unknown = JSON.parse(data);
  if (!isEncryptedData(parsed)) {
    return data;
  }
  return decrypt(parsed, passphrase);
}

/**
 * Safe JSON parse with type assertion for encrypted data.
 */
export function parseEncryptedData(data: string): EncryptedData {
  const parsed: unknown = JSON.parse(data);
  if (!isEncryptedData(parsed)) {
    throw new Error('Invalid encrypted data format');
  }
  return parsed;
}
