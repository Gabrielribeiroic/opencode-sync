/**
 * Plugin Module
 *
 * OpenCode Sync plugin exports.
 */

export { OpencodeSyncPlugin } from './plugin.js';
export {
  getPluginState,
  initializeEngine,
  updateConfig,
  setPassphrase,
  startWatcher,
  stopWatcher,
} from './state-manager.js';
export { performSync } from './sync-handler.js';
export type { PluginState } from './types.js';
