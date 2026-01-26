/**
 * Crypto Types
 *
 * Type definitions for encryption/decryption with key rotation support.
 */

/** Options for encryption/decryption with key rotation support */
export interface CryptoOptions {
  /** Current encryption key */
  passphrase?: string;
  /** Previous encryption key for decryption fallback during key rotation */
  oldPassphrase?: string;
}

/** Passphrase can be a string (legacy) or CryptoOptions (with key rotation support) */
export type PassphraseOption = string | CryptoOptions | undefined;
