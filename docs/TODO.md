# TODO

## Completed

- [x] Push optimization: inline content in tree (O(n) → O(1))
- [x] **Pull optimization: GraphQL batch fetch (O(n) → O(1))**
  - Uses GitHub GraphQL API with aliases to fetch multiple files in 1 request
  - 100 files = 1 API call (vs 100+ REST API calls before)
  - Replaced CDN + Blob API fallback with reliable GraphQL approach
- [x] Rate limit detection and backoff
- [x] Skip push when no changes
- [x] **Timestamp-based sync** - replaced vector clocks with simple lastModified comparison
  - Removed vectorClock from LocalSyncState, Manifest, and all category types
  - Replaced compareVectorClocks with compareTimestamps (lastSyncedAt vs updatedAt)
  - Removed concurrent state detection (now uses last-write-wins)
  - Bumped manifest schema to 3.0
- [x] Checksum-based change detection
- [x] Manifest structure for tracking files
- [x] Tombstones for deletion tracking
- [x] Per-file granularity (not repo-level overwrite)
- [x] Pull-then-push flow (when remote is newer, pull first then push local changes)

## In Progress: Safety & Observability

- [ ] Log when local files are overwritten by remote
- [ ] Log when remote files are overwritten by local
- [ ] Add --force-local and --force-remote CLI flags for manual resolution
- [ ] Show warning on config file overwrites
- [ ] Add conflict counter to sync summary

## Backlog: Rate Limit Improvements

- [x] Add exponential backoff retry logic for GitHub API calls (already implemented in fetch.ts)
- [x] Batch file fetches to reduce API call frequency (GraphQL batch fetch)

## Future Enhancements

- [ ] ETag caching for manifest fetch (saves bandwidth, not API calls)
- [ ] GitHub webhook for push notifications (eliminate polling)
- [ ] Compression improvements for large messages
- [ ] Parallel category processing during sync

## Design Notes

### Timestamp-Based Sync Trade-offs (Research-Backed)

- **Clock skew risk**: NTP drift 1-50ms (cloud), 100-500ms (geo-distributed)
  - Source: "Clock Skew Conflict in Distributed Systems" (2026)
  - Mitigation: Modern OS auto-sync via NTP (atomic clock: 1s in 3M years)
  - Impact: Very low - machines rarely drift years apart
  - Real-world: CockroachDB uses 500ms max offset tolerance successfully
- **Concurrent edit data loss**: Last-write-wins on same file from 2 machines
  - Source: "Beyond Timestamps: Conflict Resolution" (2025)
  - Likelihood: Very low for CLI tool (one session at a time)
  - Impact: One edit lost, logged for manual recovery
  - Mitigation: Sessions/messages are mostly append-only (different files)
- **Config overwrites**: Settings changes on both machines = last wins
  - Mitigation: Show warning, allow manual merge via flags
  - Frequency: Low - settings changed infrequently
  - Precedent: VS Code Settings Sync (4M+ users) uses simple last-write-wins
