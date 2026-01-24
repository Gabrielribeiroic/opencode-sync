/**
 * State Manager
 *
 * Persists and loads local sync state and configuration.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
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
    // Config exists - use env var as fallback if no token in config
    if (!config.token && envToken) {
      config.token = envToken;
    }
    // Generate machineId if missing
    if (!config.machineId) {
      config.machineId = generateMachineId();
    }
    return config;
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
 * Save plugin configuration to disk.
 */
export async function saveConfig(pathConfig: PathConfig, config: SyncConfig): Promise<void> {
  await ensureDir(pathConfig.configDir);
  await writeFile(pathConfig.pluginConfigPath, JSON.stringify(config, null, 2), 'utf-8');
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
 * Save local sync state to disk.
 */
export async function saveLocalState(pathConfig: PathConfig, state: LocalSyncState): Promise<void> {
  await ensureDir(pathConfig.dataDir);
  await writeFile(pathConfig.localStatePath, JSON.stringify(state, null, 2), 'utf-8');
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
