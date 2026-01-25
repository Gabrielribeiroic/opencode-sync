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
 * Automatically migrates config: adds missing keys, removes obsolete ones.
 *
 * Token resolution order:
 * 1. Config file token (if exists and non-empty)
 * 2. GITHUB_TOKEN environment variable
 * 3. null (no token available)
 */
export async function loadConfig(pathConfig: PathConfig): Promise<SyncConfig | null> {
  let rawConfig: Record<string, unknown> | null = null;

  try {
    const content = await readFile(pathConfig.pluginConfigPath, 'utf-8');
    rawConfig = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // Config file doesn't exist or is invalid - will try env var
  }

  const envToken = process.env[ENV_TOKEN_KEY];

  if (rawConfig) {
    // Migrate config: use defaults, keep user values, remove obsolete keys
    const migratedConfig = migrateConfig(rawConfig);

    if (!migratedConfig.token && envToken) {
      migratedConfig.token = envToken;
    }
    if (!migratedConfig.machineId) {
      migratedConfig.machineId = generateMachineId();
    }

    // Save migrated config if it changed
    const configChanged = !configsEqual(rawConfig, migratedConfig as unknown as RawConfig);
    if (configChanged) {
      await saveConfig(pathConfig, migratedConfig);
    }

    return migratedConfig;
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

/** Raw config from disk (untyped) */
type RawConfig = Record<string, unknown>;

/** Keys that are user-specific and should always be preserved */
const USER_KEYS = [
  'token',
  'machineId',
  'repoOwner',
  'repoName',
  'branch',
  'keySalt',
  'passphraseHash',
  'oldEncryptionKey',
] as const;

/**
 * Migrate config to latest schema.
 * - Adds missing keys from DEFAULT_CONFIG
 * - Removes keys not in DEFAULT_CONFIG (except user-specific keys)
 * - Preserves user values for existing keys
 */
function migrateConfig(raw: RawConfig): SyncConfig {
  // Start with defaults
  const migrated: RawConfig = { ...DEFAULT_CONFIG };

  // Copy user-specific keys
  for (const key of USER_KEYS) {
    if (key in raw) {
      migrated[key] = raw[key];
    }
  }

  // For config keys in DEFAULT_CONFIG, use user value if present
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (!(key in raw)) continue;
    if (key === 'sync') {
      migrated['sync'] = migrateSyncCategories(raw['sync'] as RawConfig | undefined);
    } else {
      migrated[key] = raw[key];
    }
  }

  return migrated as unknown as SyncConfig;
}

/**
 * Migrate sync categories: merge with defaults, remove obsolete keys.
 */
function migrateSyncCategories(rawSync: RawConfig | undefined): RawConfig {
  const merged: RawConfig = { ...DEFAULT_CONFIG.sync, ...rawSync };
  const validKeys = new Set(Object.keys(DEFAULT_CONFIG.sync));
  const result: RawConfig = {};
  for (const key of Object.keys(merged)) {
    if (validKeys.has(key)) {
      result[key] = merged[key];
    }
  }
  return result;
}

/**
 * Check if migration actually changed config values (ignoring key order).
 * Only compares keys that exist in DEFAULT_CONFIG + USER_KEYS.
 */
function configsEqual(raw: RawConfig, migrated: RawConfig): boolean {
  const allKeys = [...Object.keys(DEFAULT_CONFIG), ...USER_KEYS];
  for (const key of allKeys) {
    const rawVal = raw[key];
    const migVal = migrated[key];
    if (rawVal === undefined && migVal === undefined) continue;
    if (rawVal === undefined || migVal === undefined) return false;
    if (JSON.stringify(rawVal) !== JSON.stringify(migVal)) return false;
  }
  // Check if raw has extra keys that will be removed
  for (const key of Object.keys(raw)) {
    if (!(key in migrated)) return false;
  }
  return true;
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
