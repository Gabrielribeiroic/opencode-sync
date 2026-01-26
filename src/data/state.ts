/**
 * State Manager
 *
 * Persists and loads local sync state and configuration.
 */

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { SyncConfig, LocalSyncState, PathConfig } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import type { RawConfig } from './config-migration.js';
import { migrateConfig, configsEqual } from './config-migration.js';
import { atomicWriteFile } from './file-io.js';

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
  let rawConfig: RawConfig | null = null;

  try {
    const content = await readFile(pathConfig.pluginConfigPath, 'utf-8');
    rawConfig = JSON.parse(content) as RawConfig;
  } catch {
    // Config file doesn't exist or is invalid - will try env var
  }

  const envToken = process.env[ENV_TOKEN_KEY];

  if (rawConfig) {
    const migratedConfig = migrateConfig(rawConfig);

    if (!migratedConfig.token && envToken) {
      migratedConfig.token = envToken;
    }
    if (!migratedConfig.machineId) {
      migratedConfig.machineId = generateMachineId();
    }

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
