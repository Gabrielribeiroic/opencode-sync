/**
 * Merge Module
 *
 * Three-way merge for JSON and JSONL data formats.
 */

export { mergeJson } from './json-merge.js';
export { mergeJsonl } from './jsonl-merge.js';
export { deepEqual, isPlainObject, hashValue } from './utils.js';
export { MergeError } from './types.js';
export type { MergeResult, MergeConflict } from './types.js';
