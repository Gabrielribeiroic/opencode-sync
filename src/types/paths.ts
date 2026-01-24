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
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const appData = process.env['APPDATA'] ?? `${homeDir}\\AppData\\Roaming`;
    const localAppData = process.env['LOCALAPPDATA'] ?? `${homeDir}\\AppData\\Local`;

    return {
      configDir: `${appData}\\opencode`,
      stateDir: `${localAppData}\\opencode`,
      dataDir: `${localAppData}\\opencode`,
      pluginConfigPath: `${appData}\\opencode\\opencode-sync.json`,
      localStatePath: `${localAppData}\\opencode\\opencode-sync-state.json`,
    };
  }

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
      `${pathConfig.configDir}/opencode.jsonc`,
      `${pathConfig.configDir}/AGENTS.md`,
      `${pathConfig.configDir}/agent`,
      `${pathConfig.configDir}/command`,
      `${pathConfig.configDir}/mode`,
      `${pathConfig.configDir}/tool`,
      `${pathConfig.configDir}/plugin`,
      `${pathConfig.configDir}/themes`,
    ],
    state: [
      `${pathConfig.stateDir}/model.json`,
      `${pathConfig.stateDir}/prompt-history.jsonl`,
      `${pathConfig.stateDir}/prompt-stash.jsonl`,
    ],
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
