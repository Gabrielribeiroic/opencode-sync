# TODO

## Completed

- [x] Push optimization: inline content in tree (O(n) → O(1))
- [x] Pull optimization: raw.githubusercontent.com (0 API calls)
- [x] Rate limit detection and backoff
- [x] Skip push when no changes

## Future

- [ ] ETag caching for manifest fetch (saves bandwidth, not API calls)
- [ ] GitHub webhook for push notifications (eliminate polling)
- [ ] Compression improvements for large messages
- [ ] Parallel category processing during sync
