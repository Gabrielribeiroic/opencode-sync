/**
 * Merge Types
 *
 * Type definitions for three-way merge operations.
 */

export interface MergeResult<T> {
  success: boolean;
  merged: T;
  conflicts?: MergeConflict[];
}

export interface MergeConflict {
  path: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
}

/**
 * Error thrown when merge fails.
 */
export class MergeError extends Error {
  constructor(
    message: string,
    public readonly conflicts: MergeConflict[]
  ) {
    super(message);
    this.name = 'MergeError';
  }
}
