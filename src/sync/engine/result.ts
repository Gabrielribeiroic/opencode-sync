/**
 * Sync Result Builders
 *
 * Helper functions for building sync operation results.
 */

import type { SyncResult, ConflictInfo, SyncCategory } from '../../types/index.js';

/**
 * Build a success result for push operations.
 */
export function buildPushResult(changedCategories: SyncCategory[]): SyncResult {
  return {
    success: true,
    action: 'pushed',
    message: `Pushed ${String(changedCategories.length)} categories`,
    changedCategories,
  };
}

/**
 * Build a success result for pull operations.
 */
export function buildPullResult(changedCategories: SyncCategory[]): SyncResult {
  return {
    success: true,
    action: 'pulled',
    message: `Pulled ${String(changedCategories.length)} categories`,
    changedCategories,
  };
}

/**
 * Build a result for conflict resolution.
 */
export function buildConflictResult(result: SyncResult, conflicts: ConflictInfo[]): SyncResult {
  const finalResult: SyncResult = {
    ...result,
    action: conflicts.length > 0 ? 'conflict' : 'merged',
  };
  if (conflicts.length > 0) {
    finalResult.conflicts = conflicts;
  }
  return finalResult;
}

/**
 * Build an error result.
 */
export function buildErrorResult(message: string, error?: Error): SyncResult {
  const result: SyncResult = { success: false, action: 'error', message };
  if (error) {
    result.error = error;
  }
  return result;
}

/**
 * Build a no-change result.
 */
export function buildNoChangeResult(): SyncResult {
  return { success: true, action: 'no-change', message: 'Already in sync' };
}

/**
 * Build a skipped result (e.g., when another instance holds the lock).
 */
export function buildSkippedResult(reason: string): SyncResult {
  return { success: true, action: 'no-change', message: `Skipped: ${reason}` };
}

/**
 * Convert an unknown error to SyncResult.
 */
export function handleSyncError(error: unknown): SyncResult {
  return buildErrorResult(
    error instanceof Error ? error.message : 'Operation failed',
    error instanceof Error ? error : new Error(String(error))
  );
}
