/**
 * Branch Operations for GitHub Repository
 *
 * Handles branch detection, creation, and management.
 */

import { RepoApiError } from './errors.js';
import type { GitRef } from './types.js';

/** Interface for HTTP client that branch operations depend on */
export interface BranchHttpClient {
  fetch(endpoint: string, options?: RequestInit): Promise<Response>;
  fetchAllowNotFound(endpoint: string): Promise<Response | null>;
}

/**
 * Branch manager for GitHub repositories.
 */
export class BranchManager {
  private readonly client: BranchHttpClient;
  private readonly configuredBranch: string | undefined;
  private detectedBranch: string | null = null;

  constructor(client: BranchHttpClient, configuredBranch?: string) {
    this.client = client;
    this.configuredBranch = configuredBranch;
  }

  /** Get the branch to use (configured, detected, or default) */
  public async getBranch(): Promise<string> {
    if (this.detectedBranch) return this.detectedBranch;

    if (this.configuredBranch) {
      const branchExists = await this.branchExists(this.configuredBranch);
      if (!branchExists) {
        await this.createBranch(this.configuredBranch);
      }
      this.detectedBranch = this.configuredBranch;
      return this.configuredBranch;
    }

    // Auto-detect: try main first, then master
    const res = await this.client.fetchAllowNotFound('/git/ref/heads/main');
    if (res?.ok) {
      this.detectedBranch = 'main';
      return 'main';
    }

    const masterRes = await this.client.fetchAllowNotFound('/git/ref/heads/master');
    if (masterRes?.ok) {
      this.detectedBranch = 'master';
      return 'master';
    }

    return 'main';
  }

  /** Check if a branch exists */
  public async branchExists(branch: string): Promise<boolean> {
    const res = await this.client.fetchAllowNotFound(`/git/ref/heads/${branch}`);
    return res?.ok ?? false;
  }

  /** Create a new branch from the default branch */
  public async createBranch(branch: string): Promise<void> {
    const defaultBranch = await this.detectDefaultBranch();
    const defaultRes = await this.client.fetch(`/git/ref/heads/${defaultBranch}`);
    if (!defaultRes.ok) {
      throw new RepoApiError(
        `Cannot find default branch (${defaultBranch}) to create new branch from`,
        404
      );
    }
    const defaultRef = (await defaultRes.json()) as GitRef;

    const body = JSON.stringify({ ref: `refs/heads/${branch}`, sha: defaultRef.object.sha });
    const res = await this.client.fetch('/git/refs', { method: 'POST', body });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { message?: string };
      throw new RepoApiError(errBody.message ?? `Failed to create branch: ${branch}`, res.status);
    }
  }

  private async detectDefaultBranch(): Promise<'main' | 'master'> {
    const res = await this.client.fetchAllowNotFound('/git/ref/heads/main');
    if (res?.ok) return 'main';
    const masterRes = await this.client.fetchAllowNotFound('/git/ref/heads/master');
    return masterRes?.ok ? 'master' : 'main';
  }
}
