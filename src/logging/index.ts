/**
 * Logging Module
 *
 * Exports the logger adapter and convenience functions.
 */

export {
  fileLogger,
  log,
  syncLog,
  logProgress,
  syncDebug,
  startOperation,
  logSetupInstructions,
} from './file-logger.js';
