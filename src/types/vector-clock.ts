/**
 * Timestamp-Based Sync Types
 *
 * Simple timestamp comparison for sync decisions (last-write-wins).
 */

/** Result of comparing two timestamps */
export type TimestampComparison =
  | 'local-newer' // Safe to push
  | 'remote-newer' // Need to pull first
  | 'equal'; // Already in sync (or use checksum as tiebreaker)
