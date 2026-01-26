/**
 * GraphQL Query Builder
 *
 * Builds batch queries for GitHub's GraphQL API.
 */

import { SYNC_DIR } from './constants.js';
import type { GraphQLRepositoryResponse, GraphQLFileData, TruncatedFile } from './types.js';

/**
 * Build a GraphQL query that fetches multiple files using aliases.
 * Requests isTruncated and oid to detect large files that need fallback fetch.
 */
export function buildBatchQuery(
  owner: string,
  repo: string,
  paths: string[],
  branch: string
): string {
  const fileQueries = paths
    .map((path, index) => {
      const fullPath = `${SYNC_DIR}/${path}`;
      // Escape special characters in path for GraphQL string
      const escapedPath = fullPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `file${String(index)}: object(expression: "${branch}:${escapedPath}") { ... on Blob { text isTruncated oid } }`;
    })
    .join('\n      ');

  return `query {
  repository(owner: "${owner}", name: "${repo}") {
      ${fileQueries}
  }
}`;
}

/** Parse GraphQL response, extracting content and identifying truncated files */
export function parseGraphQLResponse(
  paths: string[],
  res: GraphQLRepositoryResponse
): { result: Record<string, string | null>; truncated: TruncatedFile[] } {
  const result: Record<string, string | null> = {};
  const truncated: TruncatedFile[] = [];

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (path === undefined) continue;

    const fileObj = res.repository?.[`file${String(i)}`];
    if (fileObj === null || fileObj === undefined) {
      result[path] = null;
      continue;
    }

    const fileData = fileObj as GraphQLFileData;
    if (fileData.isTruncated && fileData.oid) {
      truncated.push({ path, oid: fileData.oid });
      result[path] = null;
    } else {
      result[path] = fileData.text ?? null;
    }
  }

  return { result, truncated };
}
