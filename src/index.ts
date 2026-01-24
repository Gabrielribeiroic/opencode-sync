/**
 * OpenCode Sync Plugin
 *
 * Syncs OpenCode data across machines using a GitHub private repository.
 * Uses vector clocks for conflict detection and three-way merge for resolution.
 */

import { OpencodeSyncPlugin } from './plugin/index.js';

// Only export the plugin as default - OpenCode expects a single default export
export default OpencodeSyncPlugin;
