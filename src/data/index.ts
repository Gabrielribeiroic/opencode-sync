/**
 * Data Module
 *
 * File system operations for reading and writing OpenCode data.
 */

export { loadLocalData } from './category-loader.js';
export type { LoadedData, LoadError } from './category-loader.js';

export { writeLocalData } from './writer.js';

export {
  loadConfig,
  saveConfig,
  loadLocalState,
  saveLocalState,
  generateMachineId,
  createInitialConfig,
  getTokenSource,
} from './state.js';
