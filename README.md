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

Add to your `opencode.json` config file:

```json
{
  "plugin": ["oc-sync"]
}
```

Using an AI coding agent? See [LLM Installation Guide](docs/LLM-INSTALL.md) for step-by-step prompts.

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

1. Create a [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` scope
2. Set environment variable:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

3. Start OpenCode - the plugin automatically creates a private repo for sync storage

See [Configuration Guide](docs/CONFIG.md) for all options.

## Security

- Credentials are encrypted with AES-256-GCM before upload
- Encryption key is derived from your passphrase using PBKDF2
- The repository is created as **private** (not public)
- Token is stored locally, never uploaded
- Atomic commits with compare-and-swap prevent race conditions

## Documentation

| Guide | Description |
|-------|-------------|
| [Configuration](docs/CONFIG.md) | All configuration options |
| [Architecture](docs/ARCHITECTURE.md) | Code structure and modules |
| [Sync Architecture](docs/SYNC.md) | Sync triggers, batching, data categories |
| [Sync Paths](docs/SYNC-PATHS.md) | OpenCode file locations by platform |
| [Development Setup](docs/DEV-SETUP.md) | Local development environment |
| [Publishing](docs/PUBLISH.md) | npm release process |
| [LLM Installation](docs/LLM-INSTALL.md) | Instructions for AI coding agents |

## License

AGPL-3.0
