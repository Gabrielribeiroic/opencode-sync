/**
 * Sync Result Builders
 *
 * Helper functions for building sync operation results.
 */

import type { SyncResult, ConflictInfo, SyncCategory } from '../../types/index.js';
import { getErrorMessage, toError } from '../../shared/index.js';

/** Options for building push result */
export interface BuildPushResultOptions {
  changedCategories: SyncCategory[];
  pulledData?: unknown;
}

/**
 * Build a success result for push operations.
 */
export function buildPushResult(
  changedCategoriesOrOpts: SyncCategory[] | BuildPushResultOptions
): SyncResult {
  // Support both old signature (array) and new signature (options object)
  const opts = Array.isArray(changedCategoriesOrOpts)
    ? { changedCategories: changedCategoriesOrOpts }
    : changedCategoriesOrOpts;

  const { changedCategories, pulledData } = opts;
  const result: SyncResult = {
    success: true,
    action: 'pushed',
    message: `Pushed ${String(changedCategories.length)} categories`,
    changedCategories,
  };
  if (pulledData) {
    result.pulledData = pulledData;
  }
  return result;
}

/** Options for building pull result */
export interface BuildPullResultOptions {
  changedCategories: SyncCategory[];
  pulledData?: unknown;
  tombstonedItems?: Partial<Record<SyncCategory, string[]>>;
}

/**
 * Build a success result for pull operations.
 */
export function buildPullResult(opts: BuildPullResultOptions): SyncResult {
  const { changedCategories, pulledData, tombstonedItems } = opts;
  const result: SyncResult = {
    success: true,
    action: 'pulled',
    message: `Pulled ${String(changedCategories.length)} categories`,
    changedCategories,
  };
  if (pulledData) {
    result.pulledData = pulledData;
  }
  if (tombstonedItems && Object.keys(tombstonedItems).length > 0) {
    result.tombstonedItems = tombstonedItems;
  }
  return result;
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
  return buildErrorResult(getErrorMessage(error), toError(error));
}
