/**
 * GitHub GraphQL API Client for efficient bulk file operations
 */

import { fetchWithRetry } from './fetch.js';
import { GRAPHQL_BATCH_SIZE } from './constants.js';
import type { GraphQLRepositoryResponse, TruncatedFile } from './types.js';
import { logProgress } from './logger.js';
import { buildBatchQuery, parseGraphQLResponse } from './graphql-query.js';

/** GraphQL client configuration */
export interface GraphQLClientConfig {
  token: string;
  owner: string;
  repo: string;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * GitHub GraphQL client for efficient bulk file fetching.
 * Uses aliases to batch multiple file content requests in a SINGLE API call.
 */
export class GraphQLClient {
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(config: GraphQLClientConfig) {
    this.token = config.token;
    this.owner = config.owner;
    this.repo = config.repo;
    this.maxRetries = config.maxRetries;
    this.retryDelayMs = config.retryDelayMs;
  }

  /**
   * Bulk fetch multiple files using GitHub GraphQL API.
   * Uses aliases to batch multiple file content requests in a SINGLE API call.
   * This is dramatically more efficient than REST API (1 call vs N calls).
   *
   * Example: 100 files = 1-2 GraphQL calls instead of 100+ REST calls.
   */
  public async getFiles(
    paths: string[],
    branch: string,
    fetchBlob: (sha: string) => Promise<string | null>
  ): Promise<Record<string, string | null>> {
    if (paths.length === 0) return {};

    const startTime = Date.now();
    const result: Record<string, string | null> = {};

    // Process in batches to avoid GraphQL query complexity limits
    let apiCalls = 0;
    for (let i = 0; i < paths.length; i += GRAPHQL_BATCH_SIZE) {
      const batch = paths.slice(i, i + GRAPHQL_BATCH_SIZE);
      const batchResult = await this.fetchFilesViaGraphQL(batch, branch, fetchBlob);
      apiCalls++;

      for (const [path, content] of Object.entries(batchResult)) {
        result[path] = content;
      }
    }

    const duration = Date.now() - startTime;
    const found = Object.values(result).filter((c) => c !== null).length;
    logProgress(
      `GraphQL bulk fetch: ${String(found)}/${String(paths.length)} files in ${String(duration)}ms (${String(apiCalls)} API calls)`
    );

    return result;
  }

  /**
   * Fetch multiple files in a single GraphQL request using aliases.
   * Falls back to REST Blob API for truncated (large) files.
   */
  private async fetchFilesViaGraphQL(
    paths: string[],
    branch: string,
    fetchBlob: (sha: string) => Promise<string | null>
  ): Promise<Record<string, string | null>> {
    const query = buildBatchQuery(this.owner, this.repo, paths, branch);
    const res = await this.execute(query);
    if (!res) return Object.fromEntries(paths.map((p) => [p, null]));

    // Parse response and identify truncated files
    const { result, truncated } = parseGraphQLResponse(paths, res);

    // Fallback: fetch truncated files via REST Blob API
    if (truncated.length > 0) {
      logProgress(`${String(truncated.length)} files truncated, using Blob API fallback`);
      await this.fetchTruncatedFiles(truncated, result, fetchBlob);
    }

    return result;
  }

  /**
   * Execute a GraphQL query against GitHub API.
   * Returns parsed response data or null on error.
   */
  private async execute(query: string): Promise<GraphQLRepositoryResponse | null> {
    try {
      const res = await fetchWithRetry(
        'https://api.github.com/graphql',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ query }),
        },
        this.maxRetries,
        this.retryDelayMs
      );

      if (!res.ok) {
        logProgress(`GraphQL request failed: HTTP ${String(res.status)}`);
        return null;
      }

      const data = (await res.json()) as {
        data?: GraphQLRepositoryResponse;
        errors?: { message: string }[];
      };

      if (data.errors && data.errors.length > 0) {
        logProgress(`GraphQL errors: ${data.errors.map((e) => e.message).join(', ')}`);
      }

      return data.data ?? null;
    } catch (error) {
      logProgress(`GraphQL fetch error: ${String(error)}`);
      return null;
    }
  }

  /** Fetch truncated files via REST Blob API */
  private async fetchTruncatedFiles(
    files: TruncatedFile[],
    result: Record<string, string | null>,
    fetchBlob: (sha: string) => Promise<string | null>
  ): Promise<void> {
    for (const { path, oid } of files) {
      result[path] = await fetchBlob(oid);
    }
  }
}
