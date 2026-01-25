/**
 * Sync Engine Logger
 *
 * Provides logging for sync operations with timestamps.
 * Uses file-based logging for persistence across sessions.
 */

import { homedir } from 'node:os';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const LOG_PREFIX = '[opencode-sync]';

/**
 * Log a sync message to the log file.
 */
export function syncLog(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} ${LOG_PREFIX} ${message}`;

  try {
    const logDir = join(homedir(), '.local/share/opencode/log');
    const logFile = join(logDir, 'opencode-sync.log');
    appendFileSync(logFile, logMessage + '\n');
  } catch {
    // Fallback to console if file write fails
    console.error(logMessage);
  }
}

/**
 * Log a sync operation with timing.
 * Returns a function to call when the operation completes.
 */
export function startOperation(name: string): (result?: string) => void {
  const start = Date.now();
  syncLog(`[SYNC] Starting: ${name}`);
  return (result?: string) => {
    const duration = Date.now() - start;
    const suffix = result ? ` - ${result}` : '';
    syncLog(`[SYNC] Completed: ${name} (${String(duration)}ms)${suffix}`);
  };
}

/**
 * Log detailed debug information.
 */
export function syncDebug(message: string): void {
  syncLog(`[DEBUG] ${message}`);
}
