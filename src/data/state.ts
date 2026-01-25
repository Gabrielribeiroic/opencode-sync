/**
 * State Manager
 *
 * Persists and loads local sync state and configuration.
 */

import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import type { SyncConfig, LocalSyncState, PathConfig } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';

/** Environment variable name for GitHub token */
const ENV_TOKEN_KEY = 'GITHUB_TOKEN';

/**
 * Load plugin configuration from disk with environment variable fallback.
 *
 * Token resolution order:
 * 1. Config file token (if exists and non-empty)
 * 2. GITHUB_TOKEN environment variable
 * 3. null (no token available)
 */
export async function loadConfig(pathConfig: PathConfig): Promise<SyncConfig | null> {
  let config: SyncConfig | null = null;

  try {
    const content = await readFile(pathConfig.pluginConfigPath, 'utf-8');
    config = JSON.parse(content) as SyncConfig;
  } catch {
    // Config file doesn't exist or is invalid - will try env var
  }

  const envToken = process.env[ENV_TOKEN_KEY];

  if (config) {
    // Config exists - merge with defaults and use env var as fallback if no token
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      sync: { ...DEFAULT_CONFIG.sync, ...config.sync },
    };

    if (!mergedConfig.token && envToken) {
      mergedConfig.token = envToken;
    }
    // Generate machineId if missing
    if (!mergedConfig.machineId) {
      mergedConfig.machineId = generateMachineId();
    }
    return mergedConfig;
  }

  // No config file - create minimal config from env var if available
  if (envToken) {
    return {
      ...DEFAULT_CONFIG,
      token: envToken,
      machineId: generateMachineId(),
    };
  }

  return null;
}

/**
 * Get the source of the GitHub token.
 */
export function getTokenSource(): 'config' | 'env' | 'none' {
  if (process.env[ENV_TOKEN_KEY]) {
    return 'env';
  }
  return 'none';
}

/**
 * Save plugin configuration to disk (atomic write).
 */
export async function saveConfig(pathConfig: PathConfig, config: SyncConfig): Promise<void> {
  await atomicWriteFile(pathConfig.pluginConfigPath, JSON.stringify(config, null, 2));
}

/**
 * Load local sync state from disk.
 */
export async function loadLocalState(pathConfig: PathConfig): Promise<LocalSyncState | null> {
  try {
    const content = await readFile(pathConfig.localStatePath, 'utf-8');
    return JSON.parse(content) as LocalSyncState;
  } catch {
    return null;
  }
}

/**
 * Save local sync state to disk (atomic write).
 */
export async function saveLocalState(pathConfig: PathConfig, state: LocalSyncState): Promise<void> {
  await atomicWriteFile(pathConfig.localStatePath, JSON.stringify(state, null, 2));
}

/**
 * Generate a unique machine ID.
 */
export function generateMachineId(): string {
  const host = getHostname();
  const uuidPart = randomUUID().split('-')[0] ?? 'unknown';
  return `${host}-${uuidPart}`;
}

/**
 * Get hostname (best effort).
 */
function getHostname(): string {
  try {
    return hostname()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  } catch {
    return 'machine';
  }
}

/**
 * Create initial config with defaults.
 */
export function createInitialConfig(token: string, defaults: typeof DEFAULT_CONFIG): SyncConfig {
  return {
    ...defaults,
    token,
    machineId: generateMachineId(),
  };
}

/**
 * Ensure directory exists.
 */
async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Atomically write a file using write-to-temp-then-rename pattern.
 * This prevents partial writes from corrupting files when multiple
 * processes write simultaneously.
 */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
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
