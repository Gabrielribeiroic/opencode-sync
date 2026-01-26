# Log File Locations

## Path

All platforms use XDG-style paths.

| Platform | Path |
|----------|------|
| Linux | `~/.local/share/opencode/log/opencode-sync.log` |
| macOS | `~/.local/share/opencode/log/opencode-sync.log` |
| Windows | `%USERPROFILE%\.local\share\opencode\log\opencode-sync.log` |

## View Logs

Linux/macOS:
```
cat ~/.local/share/opencode/log/opencode-sync.log
tail -f ~/.local/share/opencode/log/opencode-sync.log
```

Windows PowerShell:
```
Get-Content $HOME\.local\share\opencode\log\opencode-sync.log
Get-Content $HOME\.local\share\opencode\log\opencode-sync.log -Wait
```

Windows Command Prompt:
```
type %USERPROFILE%\.local\share\opencode\log\opencode-sync.log
```

## Format

```
[ISO_TIMESTAMP] [opencode-sync] [CATEGORY] [LEVEL] message
```

Categories: `SYNC`, `REPO`, `PLUGIN`, `DEBUG`, `WRITE`

## Implementation

Source: `src/logging/file-logger.ts`

```typescript
const LOG_DIR = join(homedir(), '.local/share/opencode/log');
const LOG_FILE = join(LOG_DIR, 'opencode-sync.log');
```

## Notes

- No log rotation
- Falls back to console.error if file write fails
- Directory must exist
