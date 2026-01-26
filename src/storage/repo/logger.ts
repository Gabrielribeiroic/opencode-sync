/**
 * Logging utility for GitHub Repository Storage Backend
 */

import { homedir } from 'node:os';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

/** Log progress for debugging */
export function logProgress(message: string): void {
  try {
    const logDir = join(homedir(), '.local/share/opencode/log');
    const logFile = join(logDir, 'opencode-sync.log');
    const timestamp = new Date().toISOString();
    appendFileSync(logFile, `${timestamp} [opencode-sync] [REPO] ${message}\n`);
  } catch {
    // Ignore logging errors
  }
}
