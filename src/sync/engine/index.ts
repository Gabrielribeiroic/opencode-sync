/**
 * Sync Engine Module
 *
 * Core sync engine and related utilities.
 */

export { SyncEngine } from './sync-engine.js';
export { SyncError } from './errors.js';
export type { SyncEngineOptions } from './types.js';
export { MANIFEST_FILENAME } from './types.js';
export { fetchManifest } from './manifest.js';
export { buildLocalState, isLockedByOther } from './state.js';
export {
  buildPushResult,
  buildPullResult,
  buildConflictResult,
  buildErrorResult,
  buildNoChangeResult,
  handleSyncError,
} from './result.js';
