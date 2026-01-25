# Sync Architecture

## Sync Triggers

| Trigger | Default | Config Key |
|---------|---------|------------|
| Startup | Enabled | `autoSyncOnStartup` |
| File Changes | 5s debounce | `fileWatcherDebounceMs` |
| Max Delay | 30s cap | `maxDebounceMs` |
| Interval | 5 min | `syncIntervalMinutes` |

## Activity-Aware Batching

Two timers prevent excessive syncs during heavy IO:

- **Debounce** (5s): Resets on each file change
- **Max Delay** (30s): Never resets, forces sync

Sync fires on whichever timer completes first.

```
Heavy IO:  [changes...] ──────────────────────> 30s max delay fires
Light IO:  [change] ─────> 5s inactivity ─────> debounce fires
```

## Configuration

```json
{
  "syncIntervalMinutes": 5,
  "fileWatcherDebounceMs": 5000,
  "maxDebounceMs": 30000
}
```

## Data Categories

**Blob** (single compressed file): config, state, credentials, projects, todos

**Item** (per-file sync): sessions, messages

## Remote Storage Structure

```
.opencode-sync/
├── manifest.json
├── {category}.json.gz.b64          # Blob categories
├── {category}-shard.json           # Item category index
├── sessions/{projectHash}/{id}.json.gz
└── messages/
    ├── {sessionId}/{msgId}.json.gz
    └── parts/{msgId}/{partId}.json.gz
```

## Key Files

| File | Purpose |
|------|---------|
| `src/sync/watcher/file-watcher.ts` | Debounce + max delay |
| `src/sync/engine/sync-engine.ts` | Sync orchestration |
| `src/sync/operations/push.ts` | Local → Remote |
| `src/sync/operations/pull.ts` | Remote → Local |
| `src/sync/item-packer.ts` | Per-item compression |
| `src/types/config.ts` | Config defaults |
