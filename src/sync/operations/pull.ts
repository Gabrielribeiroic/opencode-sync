/**
 * Pull Operation
 *
 * Handles pulling remote data from storage to local.
 */

import { unpackCategory } from '../packer.js';
import { maybeDecrypt, parseEncryptedData } from './helpers.js';
import type { StorageBackend } from '../../storage/index.js';
import type { PackedChunk } from '../../types/index.js';
import type { CategoryData, StorageFiles, PullResult, Manifest, SyncCategory } from './types.js';

/**
 * Pull all categories from remote.
 */
export async function pullCategories(
  manifest: Manifest,
  storageFiles: StorageFiles,
  enabledCategories: Record<SyncCategory, boolean>,
  passphrase: string | undefined,
  backend: StorageBackend
): Promise<PullResult> {
  const pulledData: CategoryData[] = [];
  const changedCategories: SyncCategory[] = [];

  for (const [category, info] of Object.entries(manifest.categories)) {
    if (!enabledCategories[category as SyncCategory]) continue;

    const data = await pullSingleCategory(category, info, storageFiles, passphrase, backend);
    pulledData.push({ category: category as SyncCategory, data });
    changedCategories.push(category as SyncCategory);
  }

  return { pulledData, changedCategories };
}

/**
 * Pull a single category from remote.
 */
async function pullSingleCategory(
  category: string,
  info: { files: string[]; checksum: string },
  storageFiles: StorageFiles,
  passphrase: string | undefined,
  backend: StorageBackend
): Promise<string> {
  const chunks = await downloadChunks(storageFiles, info.files, backend);
  const data = unpackCategory(chunks, info.checksum);

  if (category === 'credentials' && passphrase) {
    const encrypted = parseEncryptedData(data);
    return maybeDecrypt(category, JSON.stringify(encrypted), passphrase);
  }

  return data;
}

/**
 * Download all chunks for a category.
 */
export async function downloadChunks(
  storageFiles: StorageFiles,
  filenames: string[],
  backend: StorageBackend
): Promise<PackedChunk[]> {
  const chunks: PackedChunk[] = [];

  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];
    if (filename === undefined) continue;

    const chunk = await downloadSingleChunk(storageFiles, filename, i, backend);
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Download a single chunk file.
 */
async function downloadSingleChunk(
  storageFiles: StorageFiles,
  filename: string,
  index: number,
  backend: StorageBackend
): Promise<PackedChunk> {
  const file = storageFiles[filename];

  // Try to use cached content first
  let content = file?.content;

  // If no content, fetch from backend
  content ??= (await backend.getFile(filename)) ?? undefined;

  if (!content) throw new Error(`Empty chunk file: ${filename}`);

  return { index, filename, content, size: content.length };
}
