/**
 * Path Configuration - Platform-specific paths for OpenCode data
 */

import type { SyncCategory } from './categories.js';

export interface PathConfig {
  configDir: string;
  stateDir: string;
  dataDir: string;
  pluginConfigPath: string;
  localStatePath: string;
}

export function getPathConfig(homeDir: string): PathConfig {
  // OpenCode uses xdg-basedir which applies XDG-style paths on ALL platforms
  // including Windows. See: https://github.com/sindresorhus/xdg-basedir
  // This means ~/.config, ~/.local/share, ~/.local/state are used everywhere.
  return {
    configDir: `${homeDir}/.config/opencode`,
    stateDir: `${homeDir}/.local/state/opencode`,
    dataDir: `${homeDir}/.local/share/opencode`,
    pluginConfigPath: `${homeDir}/.config/opencode/opencode-sync.json`,
    localStatePath: `${homeDir}/.local/share/opencode/opencode-sync-state.json`,
  };
}

/** Maps each sync category to its filesystem paths */
export function getCategoryPaths(pathConfig: PathConfig): Record<SyncCategory, string[]> {
  return {
    config: [
      `${pathConfig.configDir}/opencode.json`,
      `${pathConfig.configDir}/commands`,
      `${pathConfig.configDir}/plugins`,
    ],
    state: [`${pathConfig.stateDir}/model.json`, `${pathConfig.stateDir}/prompt-history.jsonl`],
    credentials: [`${pathConfig.dataDir}/auth.json`, `${pathConfig.dataDir}/mcp-auth.json`],
    sessions: [`${pathConfig.dataDir}/storage/session`],
    messages: [`${pathConfig.dataDir}/storage/message`, `${pathConfig.dataDir}/storage/part`],
    projects: [`${pathConfig.dataDir}/storage/project`],
    todos: [`${pathConfig.dataDir}/storage/todo`, `${pathConfig.dataDir}/storage/session_diff`],
  };
}

/** Determine which category a file path belongs to */
export function getCategoryForPath(filePath: string, pathConfig: PathConfig): SyncCategory | null {
  const categoryPaths = getCategoryPaths(pathConfig);

  for (const [category, paths] of Object.entries(categoryPaths)) {
    for (const basePath of paths) {
      if (filePath.startsWith(basePath)) {
        return category as SyncCategory;
      }
    }
  }

  return null;
}
