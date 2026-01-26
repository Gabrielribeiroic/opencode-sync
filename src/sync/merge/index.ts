/**
 * Merge Module
 *
 * Three-way merge utilities for JSON and JSONL data.
 * Used for conflict resolution in tree-indexed sync.
 */

export { mergeJson } from './json-merge.js';
export { mergeJsonl } from './jsonl-merge.js';
export { deepEqual, isPlainObject, hashValue } from './utils.js';
export { MergeError } from './types.js';
export type { MergeResult, MergeConflict } from './types.js';
