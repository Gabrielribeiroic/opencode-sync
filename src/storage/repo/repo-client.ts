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
      const res = await this.fetch(`/contents/${SYNC_DIR}/manifest.json`);
      return res.ok;
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
    const res = await this.fetch(`/contents/${fullPath}`);
    if (!res.ok) return null;

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
    // Get current HEAD commit SHA
    const headSha = await this.getHeadSha();

    // Get current tree
    const currentTree = await this.getTree(headSha);

    // Build new tree entries
    const treeEntries = await this.buildTreeEntries(files, currentTree);

    // Create new tree
    const newTreeSha = await this.createTree(treeEntries, currentTree.sha);

    // Create commit
    const fileCount = String(Object.keys(files).length);
    const message = `Sync update: ${fileCount} files`;
    const commitSha = await this.createCommit(message, newTreeSha, headSha);

    // Update HEAD ref
    await this.updateRef(commitSha);
  }

  public async listFiles(): Promise<StorageFile[]> {
    const res = await this.fetch(`/contents/${SYNC_DIR}`);
    if (!res.ok) return [];

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
    const res = await this.fetch('/git/ref/heads/main');
    if (res.ok) {
      this.detectedBranch = 'main';
      return 'main';
    }

    const masterRes = await this.fetch('/git/ref/heads/master');
    if (masterRes.ok) {
      this.detectedBranch = 'master';
      return 'master';
    }

    // Default to main if neither exists (new repo)
    return 'main';
  }

  private async branchExists(branch: string): Promise<boolean> {
    const res = await this.fetch(`/git/ref/heads/${branch}`);
    return res.ok;
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
    const res = await this.fetch('/git/ref/heads/main');
    if (res.ok) return 'main';

    const masterRes = await this.fetch('/git/ref/heads/master');
    if (masterRes.ok) return 'master';

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

    // Add new/updated files
    for (const [path, content] of Object.entries(files)) {
      const fullPath = `${SYNC_DIR}/${path}`;

      if (content === null) {
        // File deletion - already excluded from entries
        continue;
      }

      // Create blob for new content
      const blobSha = await this.createBlob(content);
      entries.push({
        path: fullPath,
        mode: '100644',
        type: 'blob',
        sha: blobSha,
      });
    }

    return entries;
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
