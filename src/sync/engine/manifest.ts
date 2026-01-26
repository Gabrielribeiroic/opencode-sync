/**
 * Manifest Operations
 *
 * Handles fetching and parsing the remote manifest.
 */

import type { StorageBackend } from '../../storage/index.js';
import { RepoApiError } from '../../storage/index.js';
import type { Manifest } from '../../types/index.js';
import { MANIFEST_FILENAME } from './types.js';

/**
 * Fetch and parse the manifest from storage.
 */
export async function fetchManifest(backend: StorageBackend): Promise<Manifest | null> {
  try {
    const content = await backend.getFile(MANIFEST_FILENAME);
    if (!content) return null;

    return JSON.parse(content) as Manifest;
  } catch (error) {
    if (error instanceof RepoApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
