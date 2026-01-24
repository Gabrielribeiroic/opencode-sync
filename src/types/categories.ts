/**
 * Sync Categories - What data types can be synced
 */

export type SyncCategory =
  | 'config'
  | 'state'
  | 'credentials'
  | 'sessions'
  | 'messages'
  | 'projects'
  | 'todos';

export const SYNC_CATEGORIES: SyncCategory[] = [
  'config',
  'state',
  'credentials',
  'sessions',
  'messages',
  'projects',
  'todos',
];

/** Check if a string is a valid sync category */
export function isSyncCategory(value: string): value is SyncCategory {
  return SYNC_CATEGORIES.includes(value as SyncCategory);
}
