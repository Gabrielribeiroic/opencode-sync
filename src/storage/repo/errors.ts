/**
 * GitHub Repository Storage Errors
 *
 * Re-exports error classes from shared module for backward compatibility.
 */

export {
  RepoApiError,
  RepoNotFoundError,
  RepoRateLimitError,
  RepoConflictError,
} from '../../shared/index.js';
