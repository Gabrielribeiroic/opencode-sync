/**
 * Vector Clock Types - For distributed conflict detection
 */

/** Machine ID to logical timestamp mapping */
export type VectorClock = Record<string, number>;

/** Result of comparing two vector clocks */
export type VectorClockComparison =
  | 'local-ahead' // Safe to push
  | 'remote-ahead' // Need to pull first
  | 'concurrent' // Conflict - both have changes
  | 'equal'; // Already in sync
