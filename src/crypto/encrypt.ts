/**
 * Encryption Utilities
 *
 * Handles encryption/decryption of sensitive data (credentials).
 * Uses AES-256-GCM with PBKDF2 key derivation.
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, createHash } from 'node:crypto';
import type { EncryptedData } from '../types/index.js';
import { EncryptionError } from '../shared/index.js';

/** PBKDF2 iterations for key derivation */
const PBKDF2_ITERATIONS = 100000;

/** Key length in bytes (256 bits for AES-256) */
const KEY_LENGTH = 32;

/** Salt length in bytes */
const SALT_LENGTH = 16;

/** IV length in bytes (96 bits for GCM) */
const IV_LENGTH = 12;

// Auth tag length: 16 bytes (used implicitly by GCM mode)

/**
 * Derive encryption key from passphrase using PBKDF2.
 */
export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Generate a random salt for key derivation.
 */
export function generateSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

/**
 * Encrypt data with AES-256-GCM.
 */
export function encrypt(data: string, passphrase: string): EncryptedData {
  // Generate random salt and IV
  const salt = generateSalt();
  const iv = randomBytes(IV_LENGTH);

  // Derive key from passphrase
  const key = deriveKey(passphrase, salt);

  // Create cipher
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  // Encrypt
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);

  // Get auth tag
  const authTag = cipher.getAuthTag();

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

/**
 * Decrypt data with AES-256-GCM.
 */
export function decrypt(encrypted: EncryptedData, passphrase: string): string {
  // Decode base64 values
  const salt = Buffer.from(encrypted.salt, 'base64');
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');
  const data = Buffer.from(encrypted.data, 'base64');

  // Derive key from passphrase
  const key = deriveKey(passphrase, salt);

  // Create decipher
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  try {
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new EncryptionError('Decryption failed - wrong passphrase or corrupted data');
  }
}

/**
 * Hash a passphrase for verification (not for encryption).
 * Used to verify the passphrase is correct before attempting decryption.
 */
export function hashPassphrase(passphrase: string, salt: Buffer): string {
  const key = deriveKey(passphrase, salt);
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Verify a passphrase against a stored hash.
 */
export function verifyPassphrase(passphrase: string, salt: Buffer, expectedHash: string): boolean {
  const actualHash = hashPassphrase(passphrase, salt);
  return actualHash === expectedHash;
}

/**
 * Check if data is encrypted (has the expected structure).
 */
export function isEncryptedData(data: unknown): data is EncryptedData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;
  return (
    typeof obj['salt'] === 'string' &&
    typeof obj['iv'] === 'string' &&
    typeof obj['authTag'] === 'string' &&
    typeof obj['data'] === 'string'
  );
}

// Re-export for backward compatibility
export { EncryptionError } from '../shared/index.js';
