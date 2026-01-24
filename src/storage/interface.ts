/**
 * Storage Backend Interface
 *
 * Abstraction layer for sync storage backends (GitHub Repo, etc.)
 */

/**
 * Represents a file in the storage backend.
 */
export interface StorageFile {
  /** Filename (without path) */
  filename: string;
  /** File content (may be undefined if not fetched) */
  content?: string;
  /** SHA for updates (used by GitHub API) */
  sha?: string;
  /** File size in bytes */
  size?: number;
}

/**
 * Storage backend interface.
 * Implementations must provide atomic multi-file updates.
 */
export interface StorageBackend {
  /** Check if storage is initialized (manifest exists) */
  exists(): Promise<boolean>;

  /** Initialize storage with manifest */
  initialize(manifest: string): Promise<void>;

  /** Get file content by path */
  getFile(path: string): Promise<string | null>;

  /** Update multiple files atomically (null value = delete) */
  updateFiles(files: Record<string, string | null>): Promise<void>;

  /** List all files in storage */
  listFiles(): Promise<StorageFile[]>;
}
