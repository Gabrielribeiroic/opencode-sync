/**
 * Item Filename Utilities
 *
 * Handles conversion between item IDs and storage filenames.
 */

import type { SyncCategory } from '../types/index.js';

/**
 * Generate filename for an item in storage.
 *
 * Item IDs come from category-loader.ts in format: {type}/{parent}/{file}.json
 * We transform these to a hierarchical structure for remote storage:
 * - Sessions: session/{projectHash}/{sessionId}.json → sessions/{projectHash}/{sessionId}.json.gz
 * - Messages: message/{sessionId}/{messageId}.json → messages/{sessionId}/{messageId}.json.gz
 * - Parts:    part/{messageId}/{partId}.json → messages/parts/{messageId}/{partId}.json.gz
 */
export function getItemFilename(category: SyncCategory, itemId: string): string {
  if (category === 'sessions') {
    // itemId: session/{projectHash}/{sessionId}.json
    // Output: sessions/{projectHash}/{sessionId}.json.gz
    const match = /^session\/([^/]+)\/(.+)\.json$/.exec(itemId);
    if (match?.[1] && match[2]) {
      return `sessions/${match[1]}/${match[2]}.json.gz`;
    }
  }

  if (category === 'messages') {
    // Message: message/{sessionId}/{messageId}.json
    // Output: messages/{sessionId}/{messageId}.json.gz
    const msgMatch = /^message\/(ses_[^/]+)\/(.+)\.json$/.exec(itemId);
    if (msgMatch?.[1] && msgMatch[2]) {
      return `messages/${msgMatch[1]}/${msgMatch[2]}.json.gz`;
    }

    // Part: part/{messageId}/{partId}.json
    // Output: messages/parts/{messageId}/{partId}.json.gz
    const partMatch = /^part\/(msg_[^/]+)\/(.+)\.json$/.exec(itemId);
    if (partMatch?.[1] && partMatch[2]) {
      return `messages/parts/${partMatch[1]}/${partMatch[2]}.json.gz`;
    }
  }

  // Fallback: flat structure (replace path separators and unsafe chars)
  const safeId = itemId.replace(/[/\\:*?"<>|]/g, '_').replace(/\.json$/, '');
  return `${category}/${safeId}.json.gz`;
}

/**
 * Extract item ID from filename.
 *
 * Reverses the hierarchical remote path back to the original item ID format
 * used by category-loader.ts.
 */
export function getItemIdFromFilename(filename: string): string | null {
  // Sessions: sessions/{projectHash}/{sessionId}.json.gz -> session/{projectHash}/{sessionId}.json
  const sessionMatch = /^sessions\/([^/]+)\/([^/]+)\.json\.gz$/.exec(filename);
  if (sessionMatch?.[1] && sessionMatch[2]) {
    return `session/${sessionMatch[1]}/${sessionMatch[2]}.json`;
  }

  // Messages: messages/{sessionId}/{messageId}.json.gz -> message/{sessionId}/{messageId}.json
  const msgMatch = /^messages\/(ses_[^/]+)\/([^/]+)\.json\.gz$/.exec(filename);
  if (msgMatch?.[1] && msgMatch[2]) {
    return `message/${msgMatch[1]}/${msgMatch[2]}.json`;
  }

  // Parts: messages/parts/{messageId}/{partId}.json.gz -> part/{messageId}/{partId}.json
  const partMatch = /^messages\/parts\/(msg_[^/]+)\/([^/]+)\.json\.gz$/.exec(filename);
  if (partMatch?.[1] && partMatch[2]) {
    return `part/${partMatch[1]}/${partMatch[2]}.json`;
  }

  // Fallback: old flat format - restore slashes from underscores and add .json
  const fallbackMatch = /^[^/]+\/(.+)\.json\.gz$/.exec(filename);
  if (fallbackMatch?.[1]) {
    return fallbackMatch[1].replace(/_/g, '/') + '.json';
  }
  return null;
}
