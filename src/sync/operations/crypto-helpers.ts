/** Crypto helpers for encryption/decryption of sync data. */
import type { EncryptedData } from '../../types/index.js';
import { encrypt, decrypt, isEncryptedData, EncryptionError } from '../../crypto/encrypt.js';
import type { CryptoOptions } from './types.js';

// Re-export for backwards compatibility
export type { CryptoOptions } from './types.js';

/**
 * Encrypt data if it's for credentials and passphrase is provided.
 * Always uses the current passphrase (not oldPassphrase).
 */
export function maybeEncrypt(
  category: string,
  data: string,
  options: string | CryptoOptions | undefined
): string {
  const passphrase = typeof options === 'string' ? options : options?.passphrase;
  if (category !== 'credentials' || !passphrase) {
    return data;
  }
  const encrypted = encrypt(data, passphrase);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt data if it's for credentials and passphrase is provided.
 * Supports key rotation: tries current passphrase first, falls back to oldPassphrase.
 */
export function maybeDecrypt(
  category: string,
  data: string,
  options: string | CryptoOptions | undefined
): string {
  const passphrase = typeof options === 'string' ? options : options?.passphrase;
  const oldPassphrase = typeof options === 'string' ? undefined : options?.oldPassphrase;

  if (category !== 'credentials') {
    return data;
  }

  const parsed: unknown = JSON.parse(data);
  if (!isEncryptedData(parsed)) {
    return data; // Not encrypted, return as-is
  }

  // No keys available but data is encrypted
  if (!passphrase && !oldPassphrase) {
    throw new EncryptionError(
      'Encrypted credentials found but no encryption key configured. ' +
        'Add encryptionKey to your config to decrypt.'
    );
  }

  // Try current passphrase first
  if (passphrase) {
    try {
      return decrypt(parsed, passphrase);
    } catch {
      // Current key failed, try old key if available
    }
  }

  // Try old passphrase as fallback
  if (oldPassphrase) {
    try {
      return decrypt(parsed, oldPassphrase);
    } catch {
      // Old key also failed
    }
  }

  // Both keys failed
  throw new EncryptionError(
    'Failed to decrypt credentials. Neither current nor old encryption key worked. ' +
      'Verify your encryptionKey (and oldEncryptionKey if rotating keys).'
  );
}

/** Safe JSON parse with type assertion for encrypted data. */
export function parseEncryptedData(data: string): EncryptedData {
  const parsed: unknown = JSON.parse(data);
  if (!isEncryptedData(parsed)) {
    throw new Error('Invalid encrypted data format');
  }
  return parsed;
}
