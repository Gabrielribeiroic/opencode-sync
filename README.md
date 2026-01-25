# OpenCode Sync

Sync your OpenCode configuration, sessions, and data across multiple machines using a private GitHub repository.

## Features

- **Sync Everything** - Config, sessions, messages, credentials, prompts, and more
- **Multi-Machine Support** - Safely sync across laptops, VMs, and servers simultaneously
- **Conflict Resolution** - Vector clocks detect conflicts, three-way merge resolves them
- **Encrypted Credentials** - AES-256-GCM encryption for sensitive data
- **Auto-Sync** - Syncs on startup, on file changes (5s debounce, 30s max), and every 5 minutes
- **Offline-Friendly** - Works offline, syncs when reconnected
- **Atomic Updates** - Uses Git's compare-and-swap for safe concurrent access

## Installation

### Option 1: npm package (Recommended)

Add to your `opencode.json` config file:

```json
{
  "plugin": ["oc-sync"]
}
```

### Option 2: Local plugin directory

Clone into the global plugins directory:

```bash
cd ~/.config/opencode/plugins
git clone https://github.com/ErcinDedeoglu/opencode-sync
cd opencode-sync
npm install && npm run build
```

Or for project-specific installation:

```bash
cd your-project/.opencode/plugins
git clone https://github.com/ErcinDedeoglu/opencode-sync
cd opencode-sync
npm install && npm run build
```

## What Gets Synced

| Category | Data | Default |
|----------|------|---------|
| Config | `opencode.json`, agents, commands, modes, tools, themes | ✅ Enabled |
| State | Model selections, prompt history, stashed prompts | ✅ Enabled |
| Credentials | OAuth tokens, MCP auth (encrypted) | ✅ Enabled |
| Sessions | Session metadata and history | ✅ Enabled |
| Messages | Conversation messages and parts | ✅ Enabled |
| Projects | Project configurations | ✅ Enabled |
| Todos | Task lists and session diffs | ✅ Enabled |

## How It Works

### Vector Clocks for Conflict Detection

Each machine maintains a logical timestamp. When syncing:

1. **Equal** - Both in sync, no action needed
2. **Local Ahead** - Safe to push
3. **Remote Ahead** - Need to pull
4. **Concurrent** - Both changed, needs merge

### Three-Way Merge

When conflicts occur:

1. Find common ancestor (last synced version)
2. Compute diffs from ancestor to local and remote
3. If diffs don't overlap -> auto-merge
4. If diffs overlap -> apply conflict strategy

### Conflict Strategies

Configure in `opencode-sync.json`:

- `auto-merge` (default) - Attempt automatic merge
- `local-wins` - Keep local changes on conflict
- `remote-wins` - Keep remote changes on conflict
- `newest-wins` - Keep whichever is newer
- `ask` - Prompt for resolution

## Configuration

### Quick Start

1. Create a [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` scope
2. Set the environment variable:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

3. Start OpenCode - the plugin will automatically create a private repo for sync storage

Add to your shell profile (`~/.bashrc`, `~/.zshrc`) for persistence.

### What Happens on First Run

When the plugin starts with a valid token but no storage configured:
1. Detects your GitHub username automatically
2. Creates a new **private** repository called `.opencode-sync`
3. Initializes the `.opencode-sync/` directory with a manifest
4. Saves the repo info to `~/.config/opencode/opencode-sync.json`
5. Future runs will use the same repository

### Alternative: Config File

Instead of environment variable, create `~/.config/opencode/opencode-sync.json`:

```json
{
  "token": "ghp_your_token_here"
}
```

### Token Priority

Config file token takes precedence over environment variable.

### Verifying Configuration

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

### Full Configuration Options

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

**Note:** All categories are enabled by default. Disable `messages` if you have very large conversation history (8MB+) and want to reduce sync size.

## Sync Timing

The plugin uses **activity-aware batching** to prevent excessive syncs during heavy IO:

| Trigger | Default | Description |
|---------|---------|-------------|
| **Startup** | Enabled | Immediately when OpenCode starts |
| **File Changes** | 5s debounce | Wait for inactivity before syncing |
| **Max Delay** | 30s cap | Force sync even during heavy activity |
| **Interval** | 5 minutes | Periodic sync regardless of changes |

During heavy activity, syncs are batched and fire at most every 30 seconds.

## Security

- Credentials are encrypted with AES-256-GCM before upload
- Encryption key is derived from your passphrase using PBKDF2
- The repository is created as **private** (not public)
- Token is stored locally, never uploaded
- Atomic commits with compare-and-swap prevent race conditions

## Documentation

| Guide | Description |
|-------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Code structure and modules |
| [Sync Architecture](docs/SYNC.md) | Sync triggers, batching, data categories |
| [Sync Paths](docs/SYNC-PATHS.md) | OpenCode file locations by platform |
| [Development Setup](docs/DEV-SETUP.md) | Local development environment |
| [Publishing](docs/PUBLISH.md) | npm release process |
| [LLM Installation](docs/LLM-INSTALL.md) | Instructions for AI coding agents |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run all checks (typecheck + lint + format)
npm run check

# Lint only
npm run lint

# Lint and fix
npm run lint:fix

# Type check only
npm run typecheck

# Format code
npm run format
```

## Code Quality

This project uses strict linting rules optimized for LLM readability and maintainability:

### File & Function Limits
- Max **200 lines** per file (excluding blanks/comments)
- Max **60 lines** per function
- Max **4 levels** of nesting
- Max **5 parameters** per function
- Max **20 statements** per function
- Cyclomatic complexity limit of **15**

### TypeScript Strictness
- Explicit return types required
- Explicit member accessibility required
- No `any` types allowed
- No floating promises
- Consistent type imports/exports

### Pre-commit Hooks
Husky + lint-staged runs automatically on commit:
1. Full TypeScript type checking
2. ESLint with auto-fix on staged files
3. Prettier formatting on staged files

## License

MIT
