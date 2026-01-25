# Sync Paths

OpenCode uses `xdg-basedir` which applies XDG Base Directory paths on **all platforms** (Linux, macOS, and Windows).

## Base Directories (All Platforms)

| Purpose | Path |
|---------|------|
| Config | `~/.config/opencode/` |
| State | `~/.local/state/opencode/` |
| Data | `~/.local/share/opencode/` |

## Sync Categories

| Category | Type | Path |
|----------|------|------|
| config | file | `~/.config/opencode/opencode.json` |
| config | dir | `~/.config/opencode/commands/` |
| config | dir | `~/.config/opencode/plugins/` |
| state | file | `~/.local/state/opencode/kv.json` |
| state | file | `~/.local/state/opencode/model.json` |
| state | file | `~/.local/state/opencode/prompt-history.jsonl` |
| credentials | file | `~/.local/share/opencode/auth.json` |
| credentials | file | `~/.local/share/opencode/mcp-auth.json` |
| sessions | dir | `~/.local/share/opencode/storage/session/` |
| messages | dir | `~/.local/share/opencode/storage/message/` |
| messages | dir | `~/.local/share/opencode/storage/part/` |
| projects | dir | `~/.local/share/opencode/storage/project/` |
| todos | dir | `~/.local/share/opencode/storage/todo/` |
| todos | dir | `~/.local/share/opencode/storage/session_diff/` |

## Windows Note

On Windows, `~` refers to `C:\Users\<username>`. The full paths are:

| Purpose | Windows Path |
|---------|--------------|
| Config | `C:\Users\<username>\.config\opencode\` |
| State | `C:\Users\<username>\.local\state\opencode\` |
| Data | `C:\Users\<username>\.local\share\opencode\` |

OpenCode uses `xdg-basedir` which does NOT use `%APPDATA%` or `%LOCALAPPDATA%`.

## Source References

Paths verified from OpenCode source code:
- `packages/opencode/src/global/index.ts` - Base directory definitions
- `packages/opencode/src/auth/index.ts` - auth.json location
- `packages/opencode/src/mcp/auth.ts` - mcp-auth.json location
- `packages/opencode/src/storage/storage.ts` - Storage subdirectories
- `packages/opencode/src/cli/cmd/tui/context/kv.tsx` - kv.json location
