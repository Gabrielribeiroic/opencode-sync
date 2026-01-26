/**
 * GitHub Repository Storage Backend
 *
 * Uses GitHub Tree/Commit API for atomic multi-file push.
 * Uses GitHub GraphQL API for efficient bulk file fetch (O(1) instead of O(n)).
 */

import type { StorageBackend, StorageFile } from '../interface.js';
import { SYNC_DIR, DEFAULT_MAX_RETRIES, DEFAULT_RETRY_DELAY_MS } from './constants.js';
import { GitOperations } from './git-operations.js';
import { GraphQLClient } from './graphql-client.js';
import { logProgress } from './logger.js';
import type { RepoClientConfig, GitTreeEntry } from './types.js';

// Re-export for backward compatibility
export type { RepoClientConfig } from './types.js';

/**
 * GitHub Repository storage backend implementation.
 */
export class RepoStorageBackend implements StorageBackend {
  private readonly gitOps: GitOperations;
  private readonly graphql: GraphQLClient;

  constructor(config: RepoClientConfig) {
    const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    const retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

    this.gitOps = new GitOperations(
      {
        token: config.token,
        owner: config.owner,
        repo: config.repo,
        maxRetries,
        retryDelayMs,
      },
      config.branch
    );

    this.graphql = new GraphQLClient({
      token: config.token,
      owner: config.owner,
      repo: config.repo,
      maxRetries,
      retryDelayMs,
    });
  }

  public async exists(): Promise<boolean> {
    try {
      const tree = await this.gitOps.getTreeWithFiles();
      if (!tree) return false;
      return tree.some((entry: GitTreeEntry) => entry.path === `${SYNC_DIR}/manifest.json`);
    } catch {
      return false;
    }
  }

  public async initialize(manifest: string): Promise<void> {
    await this.updateFiles({ 'manifest.json': manifest });
  }

  public async getFile(path: string): Promise<string | null> {
    const result = await this.getFiles([path]);
    return result[path] ?? null;
  }

  public async updateFiles(files: Record<string, string | null>): Promise<void> {
    const fileCount = Object.keys(files).length;
    const startTime = Date.now();

    // Get current HEAD commit and its tree SHA
    const headSha = await this.gitOps.getHeadSha();
    const baseTreeSha = await this.gitOps.getCommitTreeSha(headSha);

    // Build tree entries with inline content (no separate blob creation needed)
    const treeEntries = this.gitOps.buildTreeEntries(files);
    logProgress(`Prepared ${String(treeEntries.length)} tree entries`);

    // Create new tree with base_tree for incremental update
    const newTreeSha = await this.gitOps.createTree(treeEntries, baseTreeSha);

    // Create commit
    const message = `Sync update: ${String(fileCount)} files`;
    const commitSha = await this.gitOps.createCommit(message, newTreeSha, headSha);

    // Update HEAD ref
    await this.gitOps.updateRef(commitSha);

    const totalDuration = Date.now() - startTime;
    logProgress(
      `Upload complete: ${String(fileCount)} files in ${String(totalDuration)}ms (~5 API calls)`
    );
  }

  public async listFiles(): Promise<StorageFile[]> {
    const entries = await this.gitOps.getSyncDirTree();

    return entries.map((entry) => ({
      filename: entry.path.replace(`${SYNC_DIR}/`, ''),
      sha: entry.sha,
      size: entry.size ?? 0,
    }));
  }

  /**
   * Bulk fetch multiple files using GitHub GraphQL API.
   * Uses aliases to batch multiple file content requests in a SINGLE API call.
   * This is dramatically more efficient than REST API (1 call vs N calls).
   *
   * Example: 100 files = 1-2 GraphQL calls instead of 100+ REST calls.
   */
  public async getFiles(paths: string[]): Promise<Record<string, string | null>> {
    if (paths.length === 0) return {};

    const branch = await this.gitOps.getBranch();
    return this.graphql.getFiles(paths, branch, (sha) => this.gitOps.fetchBlob(sha));
  }
}
