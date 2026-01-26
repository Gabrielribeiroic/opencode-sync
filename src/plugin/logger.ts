/**
 * Plugin logger - writes to file only, no console output.
 */

import { homedir } from 'node:os';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

/** Log prefix for consistent output */
const LOG_PREFIX = '[opencode-sync]';

/** Log helper - writes to file only, no console output */
export function log(message: string): void {
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

/** Log setup instructions when configuration is missing */
export function logSetupInstructions(): void {
  log('To configure, either:');
  log('  1. Set GITHUB_TOKEN environment variable (with repo scope)');
  log('  2. Create ~/.config/opencode/opencode-sync.json with token');
}
