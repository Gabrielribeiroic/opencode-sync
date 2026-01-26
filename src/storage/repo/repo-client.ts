/**
 * GitHub Repository Storage Backend
 *
 * Uses GitHub Tree/Commit API for atomic multi-file push.
 * Uses GitHub GraphQL API for efficient bulk file fetch (O(1) instead of O(n)).
 */

/* eslint-disable max-lines */
import type { StorageBackend, StorageFile } from '../interface.js';
import { fetchWithRetry } from './fetch.js';
import { RepoApiError, RepoConflictError } from './errors.js';

/** Directory in repo where sync data is stored */
const SYNC_DIR = '.opencode-sync';

/** Default retry settings */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

export interface RepoClientConfig {
  token: string;
  owner: string;
  repo: string;
  /** Branch to use for sync (auto-detected if not specified, created if missing) */
  branch?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface GitRef {
  ref: string;
  object: { sha: string; type: string };
}

interface GitTreeResponse {
  sha: string;
  tree?: GitTreeEntry[];
  truncated?: boolean;
}

interface GitTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitCommit {
  sha: string;
}

/** Tree entry for GitHub API - can use either sha (existing blob) or content (inline) */
interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha?: string | null;
  content?: string;
}

/** Max files per GraphQL batch (GitHub has query complexity limits) */
const GRAPHQL_BATCH_SIZE = 100;

/**
 * GitHub Repository storage backend implementation.
 */
export class RepoStorageBackend implements StorageBackend {
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly configuredBranch: string | undefined;
  private detectedBranch: string | null = null;

  constructor(config: RepoClientConfig) {
    this.token = config.token;
    this.owner = config.owner;
    this.repo = config.repo;
    this.baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.configuredBranch = config.branch;
  }

  public async exists(): Promise<boolean> {
    try {
      const tree = await this.getTreeWithFiles();
      if (!tree) return false;
      return tree.some((entry: GitTreeEntry) => entry.path === `${SYNC_DIR}/manifest.json`);
    } catch (error) {
      // 404 means branch doesn't exist, which is expected for new repos
      if (error instanceof RepoApiError && error.status === 404) {
        return false;
      }
      throw error;
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
    const headSha = await this.getHeadSha();
    const baseTreeSha = await this.getCommitTreeSha(headSha);

    // Build tree entries with inline content (no separate blob creation needed)
    const treeEntries = this.buildTreeEntries(files);
    this.logProgress(`Prepared ${String(treeEntries.length)} tree entries`);

    // Create new tree with base_tree for incremental update
    const newTreeSha = await this.createTree(treeEntries, baseTreeSha);

    // Create commit
    const message = `Sync update: ${String(fileCount)} files`;
    const commitSha = await this.createCommit(message, newTreeSha, headSha);

    // Update HEAD ref
    await this.updateRef(commitSha);

    const totalDuration = Date.now() - startTime;
    this.logProgress(
      `Upload complete: ${String(fileCount)} files in ${String(totalDuration)}ms (~5 API calls)`
    );
  }

  /** Log progress for debugging */
  private logProgress(message: string): void {
    try {
      // Use dynamic require to avoid module resolution issues
      /* eslint-disable @typescript-eslint/no-require-imports */
      const os = require('node:os') as { homedir: () => string };
      const fs = require('node:fs') as { appendFileSync: (path: string, data: string) => void };
      const path = require('node:path') as { join: (...parts: string[]) => string };
      /* eslint-enable @typescript-eslint/no-require-imports */
      const logDir = path.join(os.homedir(), '.local/share/opencode/log');
      const logFile = path.join(logDir, 'opencode-sync.log');
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logFile, `${timestamp} [opencode-sync] [REPO] ${message}\n`);
    } catch {
      // Ignore logging errors
    }
  }

  public async listFiles(): Promise<StorageFile[]> {
    const entries = await this.getSyncDirTree();

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

    const startTime = Date.now();
    const branch = await this.getBranch();
    const result: Record<string, string | null> = {};

    // Process in batches to avoid GraphQL query complexity limits
    let apiCalls = 0;
    for (let i = 0; i < paths.length; i += GRAPHQL_BATCH_SIZE) {
      const batch = paths.slice(i, i + GRAPHQL_BATCH_SIZE);
      const batchResult = await this.fetchFilesViaGraphQL(batch, branch);
      apiCalls++;

      for (const [path, content] of Object.entries(batchResult)) {
        result[path] = content;
      }
    }

    const duration = Date.now() - startTime;
    const found = Object.values(result).filter((c) => c !== null).length;
    this.logProgress(
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
    branch: string
  ): Promise<Record<string, string | null>> {
    const query = this.buildGraphQLBatchQuery(paths, branch);
    const res = await this.graphqlFetch(query);
    if (!res) return Object.fromEntries(paths.map((p) => [p, null]));

    // Parse response and identify truncated files
    const { result, truncated } = this.parseGraphQLResponse(paths, res);

    // Fallback: fetch truncated files via REST Blob API
    if (truncated.length > 0) {
      this.logProgress(`${String(truncated.length)} files truncated, using Blob API fallback`);
      await this.fetchTruncatedFiles(truncated, result);
    }

    return result;
  }

  /** Parse GraphQL response, extracting content and identifying truncated files */
  private parseGraphQLResponse(
    paths: string[],
    res: { repository?: Record<string, unknown> }
  ): { result: Record<string, string | null>; truncated: { path: string; oid: string }[] } {
    const result: Record<string, string | null> = {};
    const truncated: { path: string; oid: string }[] = [];

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path === undefined) continue;

      const fileObj = res.repository?.[`file${String(i)}`];
      if (fileObj === null || fileObj === undefined) {
        result[path] = null;
        continue;
      }

      const fileData = fileObj as { text?: string | null; isTruncated?: boolean; oid?: string };
      if (fileData.isTruncated && fileData.oid) {
        truncated.push({ path, oid: fileData.oid });
        result[path] = null;
      } else {
        result[path] = fileData.text ?? null;
      }
    }

    return { result, truncated };
  }

  /** Fetch truncated files via REST Blob API */
  private async fetchTruncatedFiles(
    files: { path: string; oid: string }[],
    result: Record<string, string | null>
  ): Promise<void> {
    for (const { path, oid } of files) {
      result[path] = await this.fetchBlob(oid);
    }
  }

  /** Fetch a single blob by SHA via REST API (for large files) */
  private async fetchBlob(sha: string): Promise<string | null> {
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

  /**
   * Build a GraphQL query that fetches multiple files using aliases.
   * Requests isTruncated and oid to detect large files that need fallback fetch.
   */
  private buildGraphQLBatchQuery(paths: string[], branch: string): string {
    const fileQueries = paths
      .map((path, index) => {
        const fullPath = `${SYNC_DIR}/${path}`;
        // Escape special characters in path for GraphQL string
        const escapedPath = fullPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `file${String(index)}: object(expression: "${branch}:${escapedPath}") { ... on Blob { text isTruncated oid } }`;
      })
      .join('\n      ');

    return `query {
  repository(owner: "${this.owner}", name: "${this.repo}") {
      ${fileQueries}
  }
}`;
  }

  /**
   * Execute a GraphQL query against GitHub API.
   * Returns parsed response data or null on error.
   */
  private async graphqlFetch(
    query: string
  ): Promise<{ repository?: Record<string, unknown> } | null> {
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
        this.logProgress(`GraphQL request failed: HTTP ${String(res.status)}`);
        return null;
      }

      const data = (await res.json()) as {
        data?: { repository?: Record<string, unknown> };
        errors?: { message: string }[];
      };

      if (data.errors && data.errors.length > 0) {
        this.logProgress(`GraphQL errors: ${data.errors.map((e) => e.message).join(', ')}`);
        // Still return partial data if available
      }

      return data.data ?? null;
    } catch (error) {
      this.logProgress(`GraphQL fetch error: ${String(error)}`);
      return null;
    }
  }

  // --- Private helpers ---

  private async fetch(path: string, options?: RequestInit): Promise<Response> {
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
  private async fetchAllowNotFound(path: string, options?: RequestInit): Promise<Response | null> {
    try {
      return await this.fetch(path, options);
    } catch (error) {
      if (error instanceof RepoApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private async getBranch(): Promise<string> {
    if (this.detectedBranch) return this.detectedBranch;

    // If branch is configured, use it (create if missing)
    if (this.configuredBranch) {
      const branchExists = await this.branchExists(this.configuredBranch);
      if (!branchExists) {
        await this.createBranch(this.configuredBranch);
      }
      this.detectedBranch = this.configuredBranch;
      return this.configuredBranch;
    }

    // Auto-detect: try main first, then master
    const res = await this.fetchAllowNotFound('/git/ref/heads/main');
    if (res?.ok) {
      this.detectedBranch = 'main';
      return 'main';
    }

    const masterRes = await this.fetchAllowNotFound('/git/ref/heads/master');
    if (masterRes?.ok) {
      this.detectedBranch = 'master';
      return 'master';
    }

    // Default to main if neither exists (new repo)
    return 'main';
  }

  private async branchExists(branch: string): Promise<boolean> {
    const res = await this.fetchAllowNotFound(`/git/ref/heads/${branch}`);
    return res?.ok ?? false;
  }

  private async createBranch(branch: string): Promise<void> {
    // Get SHA from default branch (main or master)
    const defaultBranch = await this.detectDefaultBranch();
    const defaultRes = await this.fetch(`/git/ref/heads/${defaultBranch}`);
    if (!defaultRes.ok) {
      throw new RepoApiError(
        `Cannot find default branch (${defaultBranch}) to create new branch from`,
        404
      );
    }
    const defaultRef = (await defaultRes.json()) as GitRef;
    const baseSha = defaultRef.object.sha;

    // Create new branch ref
    const body = JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });

    const res = await this.fetch('/git/refs', { method: 'POST', body });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { message?: string };
      throw new RepoApiError(
        errBody.message ?? `Failed to create branch: ${branch}`,
        res.status,
        errBody
      );
    }
  }

  /** Detect default branch without creating - used as base for new branches */
  private async detectDefaultBranch(): Promise<'main' | 'master'> {
    const res = await this.fetchAllowNotFound('/git/ref/heads/main');
    if (res?.ok) return 'main';

    const masterRes = await this.fetchAllowNotFound('/git/ref/heads/master');
    if (masterRes?.ok) return 'master';

    return 'main';
  }

  private async getHeadSha(): Promise<string> {
    const branch = await this.getBranch();
    const res = await this.fetch(`/git/ref/heads/${branch}`);
    if (!res.ok) {
      throw new RepoApiError(`Cannot find ${branch} branch`, 404);
    }
    const data = (await res.json()) as GitRef;
    return data.object.sha;
  }

  /**
   * Get all files in the repo using Tree API (recursive).
   * Returns null if branch doesn't exist yet.
   */
  private async getTreeWithFiles(): Promise<GitTreeEntry[] | null> {
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

  /**
   * Get tree entries filtered to sync directory only.
   * Returns file entries with their SHAs for blob fetching.
   */
  private async getSyncDirTree(): Promise<GitTreeEntry[]> {
    const tree = await this.getTreeWithFiles();
    if (!tree) return [];

    // Filter to only files in SYNC_DIR
    return tree.filter((entry) => entry.type === 'blob' && entry.path.startsWith(`${SYNC_DIR}/`));
  }

  /** Get the tree SHA for a commit */
  private async getCommitTreeSha(commitSha: string): Promise<string> {
    const res = await this.fetch(`/git/commits/${commitSha}`);
    if (!res.ok) {
      throw new RepoApiError('Failed to get commit tree', res.status);
    }
    const data = (await res.json()) as { tree: { sha: string } };
    return data.tree.sha;
  }

  /**
   * Build tree entries with inline content.
   * Uses GitHub's ability to accept `content` directly instead of blob SHA,
   * reducing API calls from N+5 to just 5 (regardless of file count).
   */
  private buildTreeEntries(files: Record<string, string | null>): TreeEntry[] {
    const entries: TreeEntry[] = [];

    for (const [path, content] of Object.entries(files)) {
      const fullPath = `${SYNC_DIR}/${path}`;
      if (content === null) {
        // Delete file by setting sha to null
        entries.push({ path: fullPath, mode: '100644', type: 'blob', sha: null });
      } else {
        // Add/update file with inline content (no blob creation needed!)
        entries.push({ path: fullPath, mode: '100644', type: 'blob', content });
      }
    }

    return entries;
  }

  /**
   * Create a new tree using base_tree for incremental updates.
   * Entries can use either `sha` (for existing blobs) or `content` (inline).
   */
  private async createTree(entries: TreeEntry[], baseSha: string): Promise<string> {
    const body = JSON.stringify({
      base_tree: baseSha,
      tree: entries.map((e) => {
        if (e.content !== undefined) {
          // Inline content - GitHub will create the blob automatically
          return { path: e.path, mode: e.mode, type: e.type, content: e.content };
        }
        // Delete (sha: null) or reference existing blob
        return { path: e.path, mode: e.mode, type: e.type, sha: e.sha };
      }),
    });

    const res = await this.fetch('/git/trees', { method: 'POST', body });
    if (!res.ok) {
      throw new RepoApiError('Failed to create tree', res.status);
    }

    const data = (await res.json()) as GitTreeResponse;
    return data.sha;
  }

  private async createCommit(message: string, treeSha: string, parentSha: string): Promise<string> {
    const body = JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
      author: {
        name: 'OpenCode Sync',
        email: 'github-actions[bot]@users.noreply.github.com',
      },
      committer: {
        name: 'OpenCode Sync',
        email: 'github-actions[bot]@users.noreply.github.com',
      },
    });

    const res = await this.fetch('/git/commits', { method: 'POST', body });
    if (!res.ok) {
      throw new RepoApiError('Failed to create commit', res.status);
    }

    const data = (await res.json()) as GitCommit;
    return data.sha;
  }

  private async updateRef(commitSha: string): Promise<void> {
    // force: false ensures proper CAS - GitHub will reject if HEAD moved
    const body = JSON.stringify({ sha: commitSha, force: false });
    const branch = await this.getBranch();

    const res = await this.fetch(`/git/refs/heads/${branch}`, { method: 'PATCH', body });

    if (!res.ok) {
      if (res.status === 422) {
        throw new RepoConflictError('Branch was updated by another process');
      }
      throw new RepoApiError('Failed to update ref', res.status);
    }
  }
}
