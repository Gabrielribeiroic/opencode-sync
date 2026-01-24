/**
 * GitHub Repository Storage Errors
 */

/**
 * Base error for repo API failures.
 */
export class RepoApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'RepoApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Error when repo doesn't exist or is inaccessible.
 */
export class RepoNotFoundError extends RepoApiError {
  constructor(owner: string, repo: string) {
    super(`Repository not found: ${owner}/${repo}`, 404);
    this.name = 'RepoNotFoundError';
  }
}

/**
 * Error when rate limit is exceeded.
 */
export class RepoRateLimitError extends RepoApiError {
  public readonly resetTimestamp: number;

  constructor(resetTimestamp: number) {
    super('GitHub API rate limit exceeded', 429);
    this.name = 'RepoRateLimitError';
    this.resetTimestamp = resetTimestamp;
  }
}

/**
 * Error when atomic update fails due to conflict.
 */
export class RepoConflictError extends RepoApiError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'RepoConflictError';
  }
}
