/**
 * Application Error Classes
 *
 * Base error class and domain-specific error classes for consistent
 * error handling across the application.
 */

/**
 * Base error class for all application errors.
 * Provides consistent error naming and message handling.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error thrown when packing/unpacking fails.
 */
export class PackerError extends AppError {}

/**
 * Error thrown when item packing/unpacking fails.
 */
export class ItemPackerError extends AppError {}

/**
 * Error thrown when encryption/decryption fails.
 */
export class EncryptionError extends AppError {}

/**
 * Error thrown when sync operation fails.
 */
export class SyncError extends AppError {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
  }
}

/**
 * Error thrown when merge fails.
 */
export class MergeError extends AppError {
  constructor(
    message: string,
    public readonly conflicts: MergeConflict[]
  ) {
    super(message);
  }
}

/** Conflict information for merge errors */
export interface MergeConflict {
  path: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
}

/**
 * Base error for repository API failures.
 */
export class RepoApiError extends AppError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
  }
}

/**
 * Error when repository doesn't exist or is inaccessible.
 */
export class RepoNotFoundError extends RepoApiError {
  constructor(owner: string, repo: string) {
    super(`Repository not found: ${owner}/${repo}`, 404);
  }
}

/**
 * Error when rate limit is exceeded.
 */
export class RepoRateLimitError extends RepoApiError {
  constructor(public readonly resetTimestamp: number) {
    super('GitHub API rate limit exceeded', 429);
  }
}

/**
 * Error when atomic update fails due to conflict.
 */
export class RepoConflictError extends RepoApiError {
  constructor(message: string) {
    super(message, 409);
  }
}
