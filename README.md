# OpenCode Sync

Sync your OpenCode configuration, sessions, and data across multiple machines using a private GitHub repository.

## Features

- **Sync Everything** - Config, sessions, messages, credentials, prompts, and more
- **Multi-Machine Support** - Safely sync across laptops, VMs, and servers simultaneously
- **Conflict Resolution** - Vector clocks detect conflicts, three-way merge resolves them
- **Encrypted Credentials** - AES-256-GCM encryption for sensitive data
- **Auto-Sync** - Syncs on startup, on file changes (2s debounce), and every minute
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
git clone https://github.com/ercin/opencode-sync
cd opencode-sync
npm install && npm run build
```

Or for project-specific installation:

```bash
cd your-project/.opencode/plugins
git clone https://github.com/ercin/opencode-sync
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
| Messages | Conversation messages and parts | ❌ Disabled* |
| Projects | Project configurations | ✅ Enabled |
| Todos | Task lists and session diffs | ✅ Enabled |

*Messages sync is disabled by default because it can be very large (8MB+). Enable it in config if needed.

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
  "syncIntervalMinutes": 1,
  "sync": {
    "config": true,
    "state": true,
    "credentials": true,
    "sessions": true,
    "messages": false,
    "projects": true,
    "todos": true
  },
  "conflictStrategy": "auto-merge"
}
```

**Note:** `messages` is `false` by default because conversation history can be very large (8MB+). Set to `true` if you want to sync messages across machines.

## Sync Timing

The plugin syncs at these times:

| Trigger | When |
|---------|------|
| **Startup** | Immediately when OpenCode starts |
| **File Changes** | 2 seconds after local OpenCode files change |
| **Interval** | Every 1 minute (configurable) |

This is **not realtime** - there's typically a 1-60 second delay depending on when changes occur.

## Security

- Credentials are encrypted with AES-256-GCM before upload
- Encryption key is derived from your passphrase using PBKDF2
- The repository is created as **private** (not public)
- Token is stored locally, never uploaded
- Atomic commits with compare-and-swap prevent race conditions

## Architecture

```
src/
├── index.ts              # Main entry point (re-exports from plugin)
├── plugin/               # Plugin module
│   ├── plugin.ts         # Plugin definition and hooks
│   ├── state-manager.ts  # Plugin state management
│   ├── sync-handler.ts   # Sync operation handler
│   └── types.ts          # Plugin types
├── storage/              # Storage backend abstraction
│   ├── interface.ts      # StorageBackend interface
│   ├── repo/             # GitHub Repo backend
│   │   ├── repo-client.ts  # API client
│   │   ├── fetch.ts        # Fetch with retry logic
│   │   └── errors.ts       # API error types
│   └── index.ts          # Exports
├── sync/
│   ├── engine/           # Sync engine module
│   │   ├── sync-engine.ts  # Core orchestration
│   │   ├── state.ts        # Local state management
│   │   ├── manifest.ts     # Manifest operations
│   │   ├── result.ts       # Result builders
│   │   └── errors.ts       # Sync error types
│   ├── operations/       # Push/pull/merge operations
│   │   ├── push.ts         # Push to remote
│   │   ├── pull.ts         # Pull from remote
│   │   ├── merge-operation.ts  # Merge conflicts
│   │   └── helpers.ts      # Encryption helpers
│   ├── merge/            # Three-way merge module
│   │   ├── json-merge.ts   # JSON merge algorithm
│   │   ├── jsonl-merge.ts  # JSONL merge algorithm
│   │   └── utils.ts        # Merge utilities
│   ├── watcher/          # File watcher module
│   │   ├── file-watcher.ts     # Main watcher class
│   │   ├── directory-watcher.ts # Directory watching
│   │   └── ignore-patterns.ts  # File ignore rules
│   ├── vector-clock.ts   # Vector clock operations
│   └── packer.ts         # Compression/chunking
├── crypto/
│   └── encrypt.ts        # AES-256-GCM encryption
├── data/                 # Data loading module
│   ├── category-loader.ts  # Load by category
│   ├── directory-loader.ts # Directory traversal
│   ├── parsers.ts          # JSON/JSONL parsing
│   ├── writer.ts           # Write local data
│   └── state.ts            # Config/state persistence
└── types/                # TypeScript definitions
    ├── config.ts           # Config types
    ├── manifest.ts         # Manifest types
    ├── sync.ts             # Sync result types
    ├── vector-clock.ts     # Vector clock types
    └── paths.ts            # Path configuration
```

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
