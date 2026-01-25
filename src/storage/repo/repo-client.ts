/**
 * GitHub Repository Storage Backend
 *
 * Uses GitHub Contents/Tree/Commit API for atomic multi-file sync.
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

interface GitTree {
  sha: string;
  tree: { path: string; mode: string; type: string; sha: string }[];
}

interface GitBlob {
  sha: string;
}

interface GitCommit {
  sha: string;
}

interface ContentFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  content?: string;
  encoding?: string;
}

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
      const res = await this.fetchAllowNotFound(`/contents/${SYNC_DIR}/manifest.json`);
      return res?.ok ?? false;
    } catch (error) {
      // 404 means file doesn't exist, which is expected for new repos
      if (error instanceof RepoApiError && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  public async initialize(manifest: string): Promise<void> {
    await this.createOrUpdateFile(
      `${SYNC_DIR}/manifest.json`,
      manifest,
      'Initialize OpenCode Sync'
    );
  }

  public async getFile(path: string): Promise<string | null> {
    const fullPath = `${SYNC_DIR}/${path}`;
    const res = await this.fetchAllowNotFound(`/contents/${fullPath}`);
    if (!res?.ok) return null;

    const data = (await res.json()) as ContentFile;

    // For files >1MB, GitHub returns empty content and provides download_url
    if (!data.content && data.size > 1000000) {
      const branch = await this.getBranch();
      const downloadUrl = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${branch}/${fullPath}`;
      const downloadRes = await fetchWithRetry(
        downloadUrl,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        },
        this.maxRetries,
        this.retryDelayMs
      );

      if (!downloadRes.ok) return null;
      return await downloadRes.text();
    }

    if (!data.content) return null;
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  public async updateFiles(files: Record<string, string | null>): Promise<void> {
    const fileCount = Object.keys(files).length;
    const startTime = Date.now();

    // Get current HEAD commit SHA
    const headSha = await this.getHeadSha();

    // Get current tree
    const currentTree = await this.getTree(headSha);

    // Build new tree entries (includes blob creation)
    const blobStart = Date.now();
    const treeEntries = await this.buildTreeEntries(files, currentTree);
    const blobDuration = Date.now() - blobStart;
    this.logProgress(`Created ${String(treeEntries.length)} blobs in ${String(blobDuration)}ms`);

    // Create new tree
    const newTreeSha = await this.createTree(treeEntries, currentTree.sha);

    // Create commit
    const message = `Sync update: ${String(fileCount)} files`;
    const commitSha = await this.createCommit(message, newTreeSha, headSha);

    // Update HEAD ref
    await this.updateRef(commitSha);

    const totalDuration = Date.now() - startTime;
    this.logProgress(`Upload complete: ${String(fileCount)} files in ${String(totalDuration)}ms`);
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
    const res = await this.fetchAllowNotFound(`/contents/${SYNC_DIR}`);
    if (!res?.ok) return [];

    const data = (await res.json()) as ContentFile[];
    return data.map((f) => ({
      filename: f.name,
      sha: f.sha,
      size: f.size,
    }));
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

  private async createOrUpdateFile(path: string, content: string, message: string): Promise<void> {
    // Get current file SHA if exists (404 means file doesn't exist yet)
    let sha: string | undefined;
    try {
      const existing = await this.fetch(`/contents/${path}`);
      if (existing.ok) {
        sha = ((await existing.json()) as ContentFile).sha;
      }
    } catch (error) {
      // 404 is expected for new files
      if (!(error instanceof RepoApiError && error.status === 404)) {
        throw error;
      }
    }

    const body = JSON.stringify({
      message,
      content: Buffer.from(content).toString('base64'),
      sha,
    });

    const res = await this.fetch(`/contents/${path}`, { method: 'PUT', body });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { message?: string };
      throw new RepoApiError(
        errBody.message ?? 'Failed to create/update file',
        res.status,
        errBody
      );
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

  private async getTree(commitSha: string): Promise<GitTree> {
    const res = await this.fetch(`/git/trees/${commitSha}?recursive=1`);
    if (!res.ok) {
      throw new RepoApiError('Failed to get tree', res.status);
    }
    return (await res.json()) as GitTree;
  }

  private async buildTreeEntries(
    files: Record<string, string | null>,
    currentTree: GitTree
  ): Promise<{ path: string; mode: string; type: string; sha?: string | null }[]> {
    // Start with existing tree entries (excluding ones we're updating/deleting)
    const updatedPaths = new Set(Object.keys(files).map((p) => `${SYNC_DIR}/${p}`));

    const entries = currentTree.tree
      .filter((e) => !updatedPaths.has(e.path))
      .map((e) => ({ path: e.path, mode: e.mode, type: e.type, sha: e.sha }));

    // Collect files that need blob creation
    const filesToUpload: { path: string; content: string }[] = [];
    for (const [path, content] of Object.entries(files)) {
      if (content !== null) {
        filesToUpload.push({ path: `${SYNC_DIR}/${path}`, content });
      }
    }

    // Create blobs in small parallel batches with delays to avoid secondary rate limits
    const BATCH_SIZE = 5;
    const blobResults = await this.createBlobsInBatches(filesToUpload, BATCH_SIZE);

    // Add new entries from batch results
    for (const result of blobResults) {
      entries.push({
        path: result.path,
        mode: '100644',
        type: 'blob',
        sha: result.sha,
      });
    }

    return entries;
  }

  /**
   * Create blobs in parallel batches with rate limit protection.
   * Uses small batches with delays to avoid GitHub's secondary rate limits.
   */
  private async createBlobsInBatches(
    files: { path: string; content: string }[],
    batchSize: number
  ): Promise<{ path: string; sha: string }[]> {
    const results: { path: string; sha: string }[] = [];
    const totalBatches = Math.ceil(files.length / batchSize);

    for (let i = 0; i < files.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = files.slice(i, i + batchSize);

      if (files.length > batchSize) {
        this.logProgress(
          `Batch ${String(batchNum)}/${String(totalBatches)} (${String(batch.length)} files)`
        );
      }

      const batchPromises = batch.map(async (file) => {
        const sha = await this.createBlob(file.content);
        return { path: file.path, sha };
      });
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to avoid secondary rate limits
      if (i + batchSize < files.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return results;
  }

  private async createBlob(content: string): Promise<string> {
    const body = JSON.stringify({
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    });

    const res = await this.fetch('/git/blobs', { method: 'POST', body });
    if (!res.ok) {
      throw new RepoApiError('Failed to create blob', res.status);
    }

    const data = (await res.json()) as GitBlob;
    return data.sha;
  }

  private async createTree(
    entries: { path: string; mode: string; type: string; sha?: string | null }[],
    baseSha?: string
  ): Promise<string> {
    const body = JSON.stringify({
      base_tree: baseSha,
      tree: entries.map((e) => ({
        path: e.path,
        mode: e.mode,
        type: e.type,
        sha: e.sha,
      })),
    });

    const res = await this.fetch('/git/trees', { method: 'POST', body });
    if (!res.ok) {
      throw new RepoApiError('Failed to create tree', res.status);
    }

    const data = (await res.json()) as GitTree;
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
