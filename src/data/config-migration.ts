/**
 * Config Migration
 *
 * Handles migration of config to latest schema.
 */

import type { SyncConfig } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';

/** Raw config from disk (untyped) */
export type RawConfig = Record<string, unknown>;

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
export function migrateConfig(raw: RawConfig): SyncConfig {
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
export function configsEqual(raw: RawConfig, migrated: RawConfig): boolean {
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
