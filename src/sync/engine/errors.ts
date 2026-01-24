/**
 * Sync Engine Errors
 *
 * Custom error classes for sync operations.
 */

/**
 * Error thrown when sync operation fails.
 */
export class SyncError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'SyncError';
  }
}
