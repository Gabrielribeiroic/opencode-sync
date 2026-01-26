/**
 * Retry Configuration
 *
 * Centralized retry and backoff settings used across the codebase.
 */

/** Retry configuration for sync engine conflict resolution */
export const CONFLICT_RETRY = {
  /** Maximum retry attempts for conflict resolution */
  maxRetries: 5,
  /** Base delay for exponential backoff in milliseconds */
  baseDelayMs: 1000,
  /** Maximum backoff delay in milliseconds */
  maxBackoffMs: 10000,
} as const;

/** Retry configuration for GitHub API requests */
export const API_RETRY = {
  /** Maximum retry attempts for API requests */
  maxRetries: 3,
  /** Base delay between retries in milliseconds */
  retryDelayMs: 1000,
  /** Default timeout for API requests in milliseconds */
  timeoutMs: 30000,
  /** Maximum wait time for rate limit reset in milliseconds */
  maxRateLimitWaitMs: 60000,
} as const;

/**
 * Calculate exponential backoff delay.
 */
export function calculateBackoff(
  retryCount: number,
  baseDelayMs: number = CONFLICT_RETRY.baseDelayMs,
  maxBackoffMs: number = CONFLICT_RETRY.maxBackoffMs
): number {
  return Math.min(baseDelayMs * Math.pow(2, retryCount), maxBackoffMs);
}

/**
 * Sleep for given milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
