/**
 * Fetch with Retry for GitHub Repo API
 */

import { RepoApiError, RepoRateLimitError } from './errors.js';

/**
 * Fetch with exponential backoff retry.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  retryDelayMs: number
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await attemptFetch(url, options);
    if (result.response) return result.response;
    if (result.shouldThrow && result.error) throw result.error;
    lastError = result.error;

    if (attempt < maxRetries) {
      const delay = retryDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}

interface FetchResult {
  response?: Response;
  error?: Error;
  shouldThrow?: boolean;
}

async function attemptFetch(url: string, options: RequestInit): Promise<FetchResult> {
  try {
    const response = await fetch(url, options);
    checkRateLimit(response);

    if (!response.ok) {
      const error = await createApiError(response);
      return { error, shouldThrow: isNonRetryableError(error) };
    }

    return { response };
  } catch (error) {
    const err = error as Error;
    return { error: err, shouldThrow: isNonRetryableError(err) };
  }
}

function checkRateLimit(response: Response): void {
  if (response.status !== 403) return;

  const remaining = response.headers.get('X-RateLimit-Remaining');
  if (remaining !== '0') return;

  const resetTime = response.headers.get('X-RateLimit-Reset');
  const resetTimestamp = resetTime ? parseInt(resetTime, 10) : Date.now() / 1000 + 60;
  throw new RepoRateLimitError(resetTimestamp);
}

async function createApiError(response: Response): Promise<RepoApiError> {
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  const message = body.message ?? `HTTP ${String(response.status)}`;
  return new RepoApiError(message, response.status, body);
}

function isNonRetryableError(error: Error): boolean {
  if (!(error instanceof RepoApiError)) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
