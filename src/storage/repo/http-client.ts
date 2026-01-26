/**
 * HTTP Client for GitHub REST API
 *
 * Provides authenticated fetch helpers with retry logic.
 */

import { fetchWithRetry } from './fetch.js';
import { RepoApiError } from './errors.js';

/** Configuration for GitHub HTTP client */
export interface HttpClientConfig {
  token: string;
  owner: string;
  repo: string;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * HTTP client for GitHub REST API with authentication and retry logic.
 */
export class GitHubHttpClient {
  protected readonly token: string;
  protected readonly baseUrl: string;
  protected readonly maxRetries: number;
  protected readonly retryDelayMs: number;

  constructor(config: HttpClientConfig) {
    this.token = config.token;
    this.baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
    this.maxRetries = config.maxRetries;
    this.retryDelayMs = config.retryDelayMs;
  }

  /** Make authenticated request to GitHub API */
  public async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const opts: RequestInit = {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> | undefined),
      },
    };

    return fetchWithRetry(url, opts, this.maxRetries, this.retryDelayMs);
  }

  /**
   * Fetch that returns null for 404 instead of throwing.
   * Use this for operations where "not found" is an expected valid result.
   */
  public async fetchAllowNotFound(path: string, options?: RequestInit): Promise<Response | null> {
    try {
      return await this.fetch(path, options);
    } catch (error) {
      if (error instanceof RepoApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }
}
