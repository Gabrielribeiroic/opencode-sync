/**
 * Shared Utilities
 *
 * Common utilities used across multiple modules.
 */

export { calculateChecksum, uint8ArrayToBase64, base64ToUint8Array } from './encoding-utils.js';

export { getErrorMessage, getErrorStack, toError, isError } from './error-utils.js';

export {
  writePulledData,
  persistLocalState,
  processSyncResult,
  type StateProvider,
} from './sync-result-handler.js';

export {
  AppError,
  PackerError,
  ItemPackerError,
  EncryptionError,
  SyncError,
  MergeError,
  RepoApiError,
  RepoNotFoundError,
  RepoRateLimitError,
  RepoConflictError,
  type MergeConflict,
} from './errors.js';

export { CONFLICT_RETRY, API_RETRY, calculateBackoff, sleep } from './retry-config.js';
