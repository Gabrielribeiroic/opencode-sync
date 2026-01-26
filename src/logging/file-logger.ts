/**
 * File Logger Adapter
 *
 * Implements the Logger interface writing to a local file.
 * This is the adapter layer - contains actual I/O operations.
 */

import { homedir } from 'node:os';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger, LogCategory } from '../types/index.js';

const LOG_PREFIX = '[opencode-sync]';
const LOG_DIR = join(homedir(), '.local/share/opencode/log');
const LOG_FILE = join(LOG_DIR, 'opencode-sync.log');

/** Format a log message with timestamp and optional category */
function formatMessage(message: string, category?: LogCategory): string {
  const timestamp = new Date().toISOString();
  const categoryTag = category ? `[${category}] ` : '';
  return `${timestamp} ${LOG_PREFIX} ${categoryTag}${message}`;
}

/** Write a message to the log file */
function writeToFile(message: string): void {
  try {
    appendFileSync(LOG_FILE, message + '\n');
  } catch {
    // Fallback to console if file write fails
    console.error(message);
  }
}

/** File-based logger implementation */
export const fileLogger: Logger = {
  log(message: string, category?: LogCategory): void {
    writeToFile(formatMessage(message, category));
  },

  debug(message: string, category?: LogCategory): void {
    writeToFile(formatMessage(`[DEBUG] ${message}`, category));
  },

  info(message: string, category?: LogCategory): void {
    writeToFile(formatMessage(`[INFO] ${message}`, category));
  },

  warn(message: string, category?: LogCategory): void {
    writeToFile(formatMessage(`[WARN] ${message}`, category));
  },

  error(message: string, category?: LogCategory): void {
    writeToFile(formatMessage(`[ERROR] ${message}`, category));
  },

  startOperation(name: string): (result?: string) => void {
    const start = Date.now();
    writeToFile(formatMessage(`Starting: ${name}`, 'SYNC'));
    return (result?: string): void => {
      const duration = Date.now() - start;
      const suffix = result ? ` - ${result}` : '';
      writeToFile(formatMessage(`Completed: ${name} (${String(duration)}ms)${suffix}`, 'SYNC'));
    };
  },
};

/**
 * Convenience exports for direct use (backwards compatibility).
 * Prefer injecting the Logger interface when possible.
 */
export function log(message: string, category?: LogCategory): void {
  fileLogger.log(message, category);
}

export function syncLog(message: string): void {
  fileLogger.log(message, 'SYNC');
}

export function logProgress(message: string): void {
  fileLogger.log(message, 'REPO');
}

export function syncDebug(message: string): void {
  fileLogger.debug(message, 'SYNC');
}

export function startOperation(name: string): (result?: string) => void {
  return fileLogger.startOperation(name);
}

/** Log setup instructions when configuration is missing */
export function logSetupInstructions(): void {
  log('To configure, either:', 'PLUGIN');
  log('  1. Set GITHUB_TOKEN environment variable (with repo scope)', 'PLUGIN');
  log('  2. Create ~/.config/opencode/opencode-sync.json with token', 'PLUGIN');
}
