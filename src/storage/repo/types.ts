/**
 * Type definitions for GitHub Repository Storage Backend
 */

/** Configuration for RepoStorageBackend */
export interface RepoClientConfig {
  token: string;
  owner: string;
  repo: string;
  /** Branch to use for sync (auto-detected if not specified, created if missing) */
  branch?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

/** GitHub Git reference response */
export interface GitRef {
  ref: string;
  object: { sha: string; type: string };
}

/** GitHub Tree API response */
export interface GitTreeResponse {
  sha: string;
  tree?: GitTreeEntry[];
  truncated?: boolean;
}

/** Individual entry in a Git tree */
export interface GitTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

/** GitHub Commit response */
export interface GitCommit {
  sha: string;
}

/** Tree entry for GitHub API - can use either sha (existing blob) or content (inline) */
export interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha?: string | null;
  content?: string;
}

/** GraphQL response structure for repository queries */
export interface GraphQLRepositoryResponse {
  repository?: Record<string, unknown>;
}

/** File data from GraphQL blob query */
export interface GraphQLFileData {
  text?: string | null;
  isTruncated?: boolean;
  oid?: string;
}

/** Truncated file info for fallback fetch */
export interface TruncatedFile {
  path: string;
  oid: string;
}
