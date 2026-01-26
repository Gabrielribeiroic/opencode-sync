/**
 * Constants for GitHub Repository Storage Backend
 */

import { API_RETRY } from '../../shared/index.js';

/** Directory in repo where sync data is stored */
export const SYNC_DIR = '.opencode-sync';

/** Default retry settings (re-exported from shared for backward compatibility) */
export const DEFAULT_MAX_RETRIES = API_RETRY.maxRetries;
export const DEFAULT_RETRY_DELAY_MS = API_RETRY.retryDelayMs;

/** Max files per GraphQL batch (GitHub has query complexity limits) */
export const GRAPHQL_BATCH_SIZE = 100;
