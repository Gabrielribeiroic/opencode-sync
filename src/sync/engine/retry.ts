/**
 * Retry Logic for Sync Engine
 *
 * Handles conflict retry with exponential backoff.
 */

import type { SyncResult } from '../../types/index.js';
import { buildErrorResult } from './result.js';

/** Maximum retry attempts for conflict resolution */
export const MAX_CONFLICT_RETRIES = 5;

/** Maximum backoff delay in milliseconds */
const MAX_BACKOFF_MS = 10000;

/** Base delay for exponential backoff */
const BASE_DELAY_MS = 1000;

/**
 * Calculate exponential backoff delay.
 */
export function calculateBackoff(retryCount: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
}

/**
 * Check if max retries exceeded and return error result if so.
 */
export function checkMaxRetries(retryCount: number): SyncResult | null {
  if (retryCount >= MAX_CONFLICT_RETRIES) {
    return buildErrorResult(`Sync failed after ${String(MAX_CONFLICT_RETRIES)} conflict retries`);
  }
  return null;
}

/**
 * Sleep for given milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
