/**
 * OpenCode Sync Plugin
 *
 * Main plugin definition with hooks and event handlers.
 */

import { homedir } from 'node:os';
import { getPathConfig, type PathConfig } from '../types/paths.js';
import { createEmptyManifest } from '../types/index.js';
import { initializeState, getPluginState, updateConfig } from './state-manager.js';
import { getTokenSource } from '../data/index.js';
import { RepoStorageBackend } from '../storage/index.js';
import type { PluginState } from './types.js';

/** Default repo name for sync storage */
const DEFAULT_REPO_NAME = '.opencode-sync';

/** Log prefix for consistent output */
const LOG_PREFIX = '[opencode-sync]';

/** Log helper */
function log(message: string): void {
  console.error(`${LOG_PREFIX} ${message}`);
}

/** Log setup instructions when configuration is missing */
function logSetupInstructions(): void {
  log('To configure, either:');
  log('  1. Set GITHUB_TOKEN environment variable (with repo scope)');
  log('  2. Create ~/.config/opencode/opencode-sync.json with token');
}

/** Validate configuration and log status. Returns true if valid. */
function validateAndLogConfig(state: PluginState): boolean {
  if (!state.config) {
    log('WARNING: No configuration found');
    logSetupInstructions();
    log('Plugin loaded but sync is disabled');
    return false;
  }

  if (!state.config.token) {
    log('WARNING: No GitHub token configured');
    logSetupInstructions();
    log('Plugin loaded but sync is disabled');
    return false;
  }

  const sourceLabel = getTokenSource() === 'env' ? 'environment variable' : 'config file';
  log(`Token loaded from: ${sourceLabel}`);

  return true;
}

/** Fetch authenticated user's GitHub username */
async function getGitHubUsername(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to get GitHub user: ${String(res.status)}`);
  }

  const user = (await res.json()) as { login: string };
  return user.login;
}

/** Check if repo exists */
async function repoExists(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  return res.ok;
}

/** Create a new private repo */
async function createRepo(token: string, name: string): Promise<void> {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description: 'OpenCode Sync Storage',
      private: true,
      auto_init: true,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Failed to create repo: ${err.message ?? String(res.status)}`);
  }
}

/** Initialize storage backend with manifest */
async function initializeStorageBackend(
  token: string,
  owner: string,
  repo: string,
  machineId: string
): Promise<void> {
  const backend = new RepoStorageBackend({ token, owner, repo });
  const storageExists = await backend.exists();
  if (!storageExists) {
    log('Initializing sync storage...');
    const manifest = createEmptyManifest(machineId);
    await backend.initialize(JSON.stringify(manifest, null, 2));
  }
}

/** Create repository if it doesn't exist */
async function ensureRepoCreated(token: string, owner: string, repoName: string): Promise<void> {
  const exists = await repoExists(token, owner, repoName);
  if (!exists) {
    log('Creating sync repository...');
    await createRepo(token, repoName);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** Ensure sync storage repo exists and is initialized */
async function ensureStorageExists(pathConfig: PathConfig): Promise<void> {
  const state = getPluginState();
  const config = state.config;

  if (!config?.token || !config.machineId) return;

  if (config.repoOwner && config.repoName) {
    log(`Linked to repo: ${config.repoOwner}/${config.repoName}`);
    return;
  }

  try {
    log('Setting up sync storage...');
    const owner = await getGitHubUsername(config.token);
    const repoName = DEFAULT_REPO_NAME;

    await ensureRepoCreated(config.token, owner, repoName);
    await initializeStorageBackend(config.token, owner, repoName, config.machineId);

    log(`Linked to repo: ${owner}/${repoName}`);
    await updateConfig(pathConfig, { repoOwner: owner, repoName });
    log('Repo saved to config');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log(`ERROR: Failed to setup storage: ${errMsg}`);
    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const OpencodeSyncPlugin = async (_ctx: any): Promise<Record<string, unknown>> => {
  log('Plugin starting...');

  try {
    const pathConfig = getPathConfig(homedir());
    await initializeState(pathConfig);
    const isValid = validateAndLogConfig(getPluginState());

    if (isValid) {
      await ensureStorageExists(pathConfig);
      log('Plugin ready');
    }

    return {};
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    log(`ERROR: Plugin initialization failed: ${errMsg}`);
    if (stack) {
      console.error(stack);
    }
    return {};
  }
};
