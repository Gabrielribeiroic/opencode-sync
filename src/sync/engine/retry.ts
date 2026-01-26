/**
 * Retry Logic for Sync Engine
 *
 * Handles conflict retry with exponential backoff.
 */

import type { SyncResult } from '../../types/index.js';
import { buildErrorResult } from './result.js';
import {
  CONFLICT_RETRY,
  calculateBackoff as sharedCalculateBackoff,
  sleep as sharedSleep,
} from '../../shared/index.js';

/** Maximum retry attempts for conflict resolution */
export const MAX_CONFLICT_RETRIES = CONFLICT_RETRY.maxRetries;

/**
 * Calculate exponential backoff delay.
 */
export function calculateBackoff(retryCount: number): number {
  return sharedCalculateBackoff(retryCount);
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
  return sharedSleep(ms);
}
