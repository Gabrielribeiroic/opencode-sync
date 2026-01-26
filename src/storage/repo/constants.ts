/**
 * Constants for GitHub Repository Storage Backend
 */

/** Directory in repo where sync data is stored */
export const SYNC_DIR = '.opencode-sync';

/** Default retry settings */
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MS = 1000;

/** Max files per GraphQL batch (GitHub has query complexity limits) */
export const GRAPHQL_BATCH_SIZE = 100;
