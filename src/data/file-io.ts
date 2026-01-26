/**
 * File I/O utilities
 *
 * Atomic file operations and directory management.
 */

import { writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Ensure directory exists.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Atomically write a file using write-to-temp-then-rename pattern.
 * This prevents partial writes from corrupting files when multiple
 * processes write simultaneously.
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${String(process.pid)}.tmp`;
  await ensureDir(dirname(filePath));
  try {
    await writeFile(tempPath, content, 'utf-8');
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}
