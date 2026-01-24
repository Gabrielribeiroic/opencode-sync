/**
 * Sync Module
 *
 * Core sync functionality: engine, vector clocks, packer, merge, and watcher.
 */

// Engine
export { SyncEngine, SyncError } from './engine/index.js';
export type { SyncEngineOptions } from './engine/index.js';

// Operations
export type { CategoryData } from './operations/types.js';
export { preparePushData, needsPush } from './operations/push.js';
export { pullCategories, downloadChunks } from './operations/pull.js';
export { mergeAllCategories } from './operations/merge-operation.js';

// Vector Clock
export {
  compareVectorClocks,
  mergeVectorClocks,
  incrementClock,
  createVectorClock,
  dominates,
  getAheadMachines,
  cloneVectorClock,
  vectorClocksEqual,
} from './vector-clock.js';

// Packer
export {
  packCategory,
  unpackCategory,
  calculateChecksum,
  compress,
  decompress,
  PackerError,
} from './packer.js';

// Merge
export { mergeJson, mergeJsonl, MergeError } from './merge/index.js';
export type { MergeResult, MergeConflict } from './merge/types.js';

// Watcher
export { FileWatcher, createFileWatcher } from './watcher/index.js';
export type { FileWatcherOptions } from './watcher/index.js';
