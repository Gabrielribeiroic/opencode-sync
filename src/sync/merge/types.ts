/**
 * Merge Types
 *
 * Type definitions for three-way merge operations.
 */

import type { MergeConflict } from '../../shared/index.js';

export interface MergeResult<T> {
  success: boolean;
  merged: T;
  conflicts?: MergeConflict[];
}

// Re-export for backward compatibility
export { MergeError, type MergeConflict } from '../../shared/index.js';
