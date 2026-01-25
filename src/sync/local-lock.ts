/**
 * Local Lock for Multi-Instance Coordination
 *
 * Uses file-based locking to prevent multiple OpenCode instances on the
 * same machine from syncing simultaneously.
 *
 * Strategy:
 * 1. Lock file at ~/.local/share/opencode/.opencode-sync.lock
 * 2. Contains JSON: { pid, since, operation }
 * 3. Stale lock detection via PID liveness check
 * 4. Automatic cleanup of stale locks
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

/** Lock file location relative to OpenCode data dir */
const LOCK_FILENAME = '.opencode-sync.lock';

/** Default lock timeout in seconds (in case PID check fails) */
const DEFAULT_LOCK_TIMEOUT_SECONDS = 60;

/** Lock file content structure */
interface LockContent {
  pid: number;
  since: string; // ISO timestamp
  operation: 'sync' | 'push' | 'pull';
}

/**
 * Check if a process is running.
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    // ESRCH = no such process, EPERM = permission denied (process exists)
    return false;
  }
}

/**
 * Get the lock file path.
 */
export function getLockFilePath(dataDir: string): string {
  return join(dataDir, LOCK_FILENAME);
}

/**
 * Read current lock status.
 * Returns null if no lock exists or lock is stale.
 */
export function readLock(lockPath: string): LockContent | null {
  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    const content = readFileSync(lockPath, 'utf-8');
    const lock = JSON.parse(content) as LockContent;

    // Check if the locking process is still alive
    if (!isProcessRunning(lock.pid)) {
      // Stale lock - process died without cleaning up
      cleanupStaleLock(lockPath);
      return null;
    }

    // Check timeout as fallback (in case PID check is unreliable)
    const lockAge = Date.now() - new Date(lock.since).getTime();
    if (lockAge > DEFAULT_LOCK_TIMEOUT_SECONDS * 1000) {
      cleanupStaleLock(lockPath);
      return null;
    }

    return lock;
  } catch {
    // Corrupted lock file - remove it
    cleanupStaleLock(lockPath);
    return null;
  }
}

/**
 * Clean up a stale lock file.
 */
function cleanupStaleLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    // Ignore errors - another process may have already cleaned it
  }
}

/**
 * Attempt to acquire the local sync lock.
 * Returns true if lock was acquired, false if another instance holds it.
 */
export function acquireLock(
  lockPath: string,
  operation: LockContent['operation'] = 'sync'
): boolean {
  // Check for existing lock
  const existingLock = readLock(lockPath);
  if (existingLock) {
    // Another live instance holds the lock
    return false;
  }

  // Ensure directory exists
  const lockDir = dirname(lockPath);
  mkdirSync(lockDir, { recursive: true });

  // Create lock with atomic write (write to temp, then rename)
  const lock: LockContent = {
    pid: process.pid,
    since: new Date().toISOString(),
    operation,
  };

  const tempPath = `${lockPath}.${String(process.pid)}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(lock, null, 2), { flag: 'wx' });
    renameSync(tempPath, lockPath);

    // Double-check we own the lock (race condition protection)
    const verifyLock = readLock(lockPath);
    if (verifyLock?.pid !== process.pid) {
      // Another process won the race
      return false;
    }

    return true;
  } catch {
    // Failed to create lock - another process may have won
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    return false;
  }
}

/**
 * Release the local sync lock.
 * Only releases if we own the lock.
 */
export function releaseLock(lockPath: string): void {
  try {
    const lock = readLock(lockPath);
    if (lock?.pid === process.pid) {
      unlinkSync(lockPath);
    }
  } catch {
    // Ignore errors during release
  }
}

/**
 * Execute a function while holding the local lock.
 * Returns null if lock could not be acquired.
 */
export async function withLocalLock<T>(
  lockPath: string,
  operation: LockContent['operation'],
  fn: () => Promise<T>
): Promise<T | null> {
  if (!acquireLock(lockPath, operation)) {
    return null;
  }

  try {
    return await fn();
  } finally {
    releaseLock(lockPath);
  }
}

/**
 * Get info about who holds the lock (for logging/debugging).
 */
export function getLockHolder(lockPath: string): string | null {
  const lock = readLock(lockPath);
  if (!lock) return null;

  const ageSeconds = Math.floor((Date.now() - new Date(lock.since).getTime()) / 1000);
  return `PID ${String(lock.pid)} (${lock.operation}, ${String(ageSeconds)}s ago)`;
}
