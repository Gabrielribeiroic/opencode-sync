# Configuration

## Quick Start

1. Create a [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` scope
2. Set environment variable:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

3. Start OpenCode - the plugin automatically creates a private repo for sync storage

Add to your shell profile (`~/.bashrc`, `~/.zshrc`) for persistence.

## Alternative: Config File

Instead of environment variable, create `~/.config/opencode/opencode-sync.json`:

```json
{
  "token": "ghp_your_token_here"
}
```

Config file token takes precedence over environment variable.

## What Happens on First Run

When the plugin starts with a valid token but no storage configured:

1. Detects your GitHub username automatically
2. Creates a new **private** repository called `.opencode-sync`
3. Initializes the `.opencode-sync/` directory with a manifest
4. Saves the repo info to `~/.config/opencode/opencode-sync.json`
5. Future runs will use the same repository

## Verifying Configuration

After starting OpenCode, check the logs for:

```
[opencode-sync] Token loaded from: environment variable
[opencode-sync] Setting up sync storage...
[opencode-sync] Creating sync repository...
[opencode-sync] Linked to repo: username/.opencode-sync
[opencode-sync] Repo saved to config
[opencode-sync] Plugin ready
```

On subsequent runs:

```
[opencode-sync] Token loaded from: environment variable
[opencode-sync] Linked to repo: username/.opencode-sync
[opencode-sync] Plugin ready
```

## Full Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | string | - | GitHub PAT with `repo` scope (required) |
| `repoOwner` | string | auto | GitHub username (auto-detected) |
| `repoName` | string | `.opencode-sync` | Repository name for sync storage |
| `branch` | string | auto | Branch name (auto-detected: main/master) |
| `autoSyncOnStartup` | boolean | `true` | Sync when OpenCode starts |
| `continuousSync` | boolean | `true` | Watch files and sync on changes |
| `syncIntervalMinutes` | number | `5` | Periodic sync interval |
| `fileWatcherDebounceMs` | number | `5000` | Wait after file change before sync |
| `maxDebounceMs` | number | `30000` | Max wait during heavy activity |
| `conflictStrategy` | string | `auto-merge` | How to resolve conflicts |

## Sync Categories

Control what gets synced:

```json
{
  "sync": {
    "config": true,
    "state": true,
    "credentials": true,
    "sessions": true,
    "messages": true,
    "projects": true,
    "todos": true
  }
}
```

All categories are enabled by default. Disable `messages` if you have very large conversation history (8MB+).

## Conflict Strategies

| Strategy | Description |
|----------|-------------|
| `auto-merge` | Attempt automatic three-way merge (default) |
| `local-wins` | Keep local changes on conflict |
| `remote-wins` | Keep remote changes on conflict |
| `newest-wins` | Keep whichever is newer |
| `ask` | Prompt for resolution |

## Example: Full Config

```json
{
  "token": "ghp_your_token_here",
  "repoOwner": "auto-detected-username",
  "repoName": ".opencode-sync",
  "autoSyncOnStartup": true,
  "continuousSync": true,
  "syncIntervalMinutes": 5,
  "fileWatcherDebounceMs": 5000,
  "maxDebounceMs": 30000,
  "sync": {
    "config": true,
    "state": true,
    "credentials": true,
    "sessions": true,
    "messages": true,
    "projects": true,
    "todos": true
  },
  "conflictStrategy": "auto-merge"
}
```
