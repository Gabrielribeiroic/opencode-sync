/**
 * Merge Operation
 *
 * Handles merging local and remote data when conflicts are detected.
 */

import { calculateChecksum } from '../packer.js';
import { mergeJson, mergeJsonl } from '../merge/index.js';
import { maybeDecrypt, parseEncryptedData } from './helpers.js';
import { downloadChunks } from './pull.js';
import { unpackCategory } from '../packer.js';
import type { StorageBackend } from '../../storage/index.js';
import type { ConflictInfo } from '../../types/index.js';
import type {
  CategoryData,
  StorageFiles,
  Manifest,
  SyncCategory,
  LocalSyncState,
} from './types.js';

export interface MergeAllResult {
  mergedData: CategoryData[];
  conflicts: ConflictInfo[];
}

interface MergeContext {
  remoteManifest: Manifest;
  storageFiles: StorageFiles;
  localState: LocalSyncState | null;
  passphrase: string | undefined;
  machineId: string;
  backend: StorageBackend;
}

/**
 * Merge all categories with remote data.
 */
export async function mergeAllCategories(
  localData: CategoryData[],
  context: MergeContext
): Promise<MergeAllResult> {
  const conflicts: ConflictInfo[] = [];
  const mergedData: CategoryData[] = [];

  for (const item of localData) {
    const result = await mergeSingleCategory(item, context, conflicts);
    mergedData.push(result);
  }

  return { mergedData, conflicts };
}

/**
 * Merge a single category with remote data.
 */
async function mergeSingleCategory(
  item: CategoryData,
  context: MergeContext,
  conflicts: ConflictInfo[]
): Promise<CategoryData> {
  const { category, data, isJsonl } = item;
  const remoteInfo = context.remoteManifest.categories[category];

  if (!remoteInfo) {
    return { category, data };
  }

  const localChecksum = calculateChecksum(data);
  if (localChecksum === remoteInfo.checksum) {
    return { category, data };
  }

  const remoteData = await downloadAndDecryptCategory(
    category,
    remoteInfo,
    context.storageFiles,
    context.passphrase,
    context.backend
  );
  const baseData = context.localState?.baseVersions[category];
  const merged = mergeCategory(data, remoteData, baseData, isJsonl);

  if (!merged.success) {
    conflicts.push(createConflictInfo(category, localChecksum, remoteInfo, context.machineId));
  }

  return { category, data: merged.data, isJsonl: isJsonl ?? false };
}

/**
 * Download and decrypt a category from remote.
 */
async function downloadAndDecryptCategory(
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
 * Perform category merge using appropriate strategy.
 */
function mergeCategory(
  local: string,
  remote: string,
  base: string | undefined,
  isJsonl?: boolean
): { success: boolean; data: string } {
  const baseData = base ?? remote;

  if (isJsonl) {
    const result = mergeJsonl(baseData, local, remote);
    return { success: result.success, data: result.merged };
  }

  return mergeJsonData(baseData, local, remote);
}

/**
 * Merge JSON data with three-way merge.
 */
function mergeJsonData(
  baseData: string,
  local: string,
  remote: string
): { success: boolean; data: string } {
  try {
    const baseJson: unknown = JSON.parse(baseData);
    const localJson: unknown = JSON.parse(local);
    const remoteJson: unknown = JSON.parse(remote);
    const result = mergeJson(baseJson, localJson, remoteJson);
    return { success: result.success, data: JSON.stringify(result.merged) };
  } catch {
    return { success: false, data: local };
  }
}

/**
 * Create conflict info object.
 */
function createConflictInfo(
  category: SyncCategory,
  localChecksum: string,
  remoteInfo: { checksum: string; lastModifiedBy: string },
  machineId: string
): ConflictInfo {
  return {
    category,
    localChecksum,
    remoteChecksum: remoteInfo.checksum,
    localModifiedBy: machineId,
    remoteModifiedBy: remoteInfo.lastModifiedBy,
    resolution: 'auto-merged',
  };
}
