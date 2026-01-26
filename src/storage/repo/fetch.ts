/**
 * Fetch with Retry for GitHub Repo API
 */

import { RepoApiError, RepoRateLimitError } from './errors.js';
import { API_RETRY, sleep } from '../../shared/index.js';

/**
 * Fetch with exponential backoff retry and timeout.
 * Handles rate limits by waiting until reset time.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  retryDelayMs: number,
  timeoutMs: number = API_RETRY.timeoutMs
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await attemptFetch(url, options, timeoutMs);
    if (result.response) return result.response;
    if (result.shouldThrow && result.error) throw result.error;
    lastError = result.error;

    if (attempt < maxRetries) {
      // For rate limit errors, wait until reset time
      if (lastError instanceof RepoRateLimitError) {
        const waitTime = Math.min(
          lastError.resetTimestamp * 1000 - Date.now(),
          API_RETRY.maxRateLimitWaitMs
        );
        if (waitTime > 0) await sleep(waitTime);
      } else {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}

interface FetchResult {
  response?: Response;
  error?: Error;
  shouldThrow?: boolean;
}

async function attemptFetch(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<FetchResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      checkRateLimit(response);

      if (!response.ok) {
        const error = await createApiError(response);
        return { error, shouldThrow: isNonRetryableError(error) };
      }

      return { response };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const err = error as Error;
    // Convert abort errors to timeout errors
    if (err.name === 'AbortError') {
      return {
        error: new Error(`Request timeout after ${String(timeoutMs)}ms`),
        shouldThrow: false,
      };
    }
    return { error: err, shouldThrow: isNonRetryableError(err) };
  }
}

function checkRateLimit(response: Response): void {
  // Handle 429 Too Many Requests
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const resetTimestamp = retryAfter
      ? Date.now() / 1000 + parseInt(retryAfter, 10)
      : Date.now() / 1000 + 60;
    throw new RepoRateLimitError(resetTimestamp);
  }

  // Handle 403 with rate limit or abuse detection
  if (response.status === 403) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const retryAfter = response.headers.get('Retry-After');

    // Secondary rate limit (abuse detection) includes Retry-After
    if (retryAfter) {
      const resetTimestamp = Date.now() / 1000 + parseInt(retryAfter, 10);
      throw new RepoRateLimitError(resetTimestamp);
    }

    // Primary rate limit
    if (remaining === '0') {
      const resetTime = response.headers.get('X-RateLimit-Reset');
      const resetTimestamp = resetTime ? parseInt(resetTime, 10) : Date.now() / 1000 + 60;
      throw new RepoRateLimitError(resetTimestamp);
    }
  }
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
