/**
 * Git Operations for GitHub Repository Storage Backend
 *
 * Handles low-level Git operations: branches, trees, commits, and refs.
 */

import { RepoApiError, RepoConflictError } from './errors.js';
import { SYNC_DIR } from './constants.js';
import type { HttpClientConfig } from './http-client.js';
import { GitHubHttpClient } from './http-client.js';
import { BranchManager } from './branch-operations.js';
import type { GitRef, GitTreeResponse, GitTreeEntry, GitCommit, TreeEntry } from './types.js';

/** Configuration for GitOperations (same as HttpClientConfig) */
export type GitOperationsConfig = HttpClientConfig;

/**
 * Low-level Git operations using GitHub's Git Data API.
 * Manages branches, trees, commits, and refs.
 */
export class GitOperations extends GitHubHttpClient {
  private readonly branchManager: BranchManager;

  constructor(config: GitOperationsConfig, configuredBranch?: string) {
    super(config);
    this.branchManager = new BranchManager(this, configuredBranch);
  }

  /** Get the branch to use (configured, detected, or default) */
  public async getBranch(): Promise<string> {
    return this.branchManager.getBranch();
  }

  /** Check if a branch exists */
  public async branchExists(branch: string): Promise<boolean> {
    return this.branchManager.branchExists(branch);
  }

  /** Create a new branch from the default branch */
  public async createBranch(branch: string): Promise<void> {
    return this.branchManager.createBranch(branch);
  }

  /** Get the HEAD commit SHA for the current branch */
  public async getHeadSha(): Promise<string> {
    const branch = await this.getBranch();
    const res = await this.fetch(`/git/ref/heads/${branch}`);
    if (!res.ok) throw new RepoApiError(`Cannot find ${branch} branch`, 404);
    const data = (await res.json()) as GitRef;
    return data.object.sha;
  }

  /** Update the branch ref to point to a new commit */
  public async updateRef(commitSha: string): Promise<void> {
    const body = JSON.stringify({ sha: commitSha, force: false });
    const branch = await this.getBranch();
    const res = await this.fetch(`/git/refs/heads/${branch}`, { method: 'PATCH', body });

    if (!res.ok) {
      if (res.status === 422) throw new RepoConflictError('Branch was updated by another process');
      throw new RepoApiError('Failed to update ref', res.status);
    }
  }

  /** Get all files in the repo using Tree API (recursive) */
  public async getTreeWithFiles(): Promise<GitTreeEntry[] | null> {
    try {
      const branch = await this.getBranch();
      const res = await this.fetchAllowNotFound(`/git/trees/${branch}?recursive=1`);
      if (!res?.ok) return null;
      const data = (await res.json()) as GitTreeResponse;
      return data.tree ?? [];
    } catch {
      return null;
    }
  }

  /** Get tree entries filtered to sync directory only */
  public async getSyncDirTree(): Promise<GitTreeEntry[]> {
    const tree = await this.getTreeWithFiles();
    if (!tree) return [];
    return tree.filter((entry) => entry.type === 'blob' && entry.path.startsWith(`${SYNC_DIR}/`));
  }

  /** Get the tree SHA for a commit */
  public async getCommitTreeSha(commitSha: string): Promise<string> {
    const res = await this.fetch(`/git/commits/${commitSha}`);
    if (!res.ok) throw new RepoApiError('Failed to get commit tree', res.status);
    const data = (await res.json()) as { tree: { sha: string } };
    return data.tree.sha;
  }

  /** Create a new tree using base_tree for incremental updates */
  public async createTree(entries: TreeEntry[], baseSha: string): Promise<string> {
    const body = JSON.stringify({
      base_tree: baseSha,
      tree: entries.map((e) =>
        e.content !== undefined
          ? { path: e.path, mode: e.mode, type: e.type, content: e.content }
          : { path: e.path, mode: e.mode, type: e.type, sha: e.sha }
      ),
    });

    const res = await this.fetch('/git/trees', { method: 'POST', body });
    if (!res.ok) throw new RepoApiError('Failed to create tree', res.status);
    const data = (await res.json()) as GitTreeResponse;
    return data.sha;
  }

  /** Build tree entries with inline content */
  public buildTreeEntries(files: Record<string, string | null>): TreeEntry[] {
    return Object.entries(files).map(([path, content]) => {
      const fullPath = `${SYNC_DIR}/${path}`;
      return content === null
        ? { path: fullPath, mode: '100644', type: 'blob', sha: null }
        : { path: fullPath, mode: '100644', type: 'blob', content };
    });
  }

  /** Create a new commit */
  public async createCommit(message: string, treeSha: string, parentSha: string): Promise<string> {
    const body = JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
      author: { name: 'OpenCode Sync', email: 'github-actions[bot]@users.noreply.github.com' },
      committer: { name: 'OpenCode Sync', email: 'github-actions[bot]@users.noreply.github.com' },
    });

    const res = await this.fetch('/git/commits', { method: 'POST', body });
    if (!res.ok) throw new RepoApiError('Failed to create commit', res.status);
    const data = (await res.json()) as GitCommit;
    return data.sha;
  }

  /** Fetch a single blob by SHA via REST API (for large files) */
  public async fetchBlob(sha: string): Promise<string | null> {
    try {
      const res = await this.fetchAllowNotFound(`/git/blobs/${sha}`);
      if (!res?.ok) return null;
      const data = (await res.json()) as { content?: string; encoding?: string };
      if (!data.content || data.encoding !== 'base64') return null;
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }
}
