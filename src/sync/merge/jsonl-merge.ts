/**
 * JSONL (Newline-Delimited JSON) Merge
 *
 * Handles merging of JSONL files using content hash deduplication.
 */

import { hashValue } from './utils.js';
import type { MergeResult } from './types.js';

/**
 * Merge JSONL strings by combining unique lines.
 */
export function mergeJsonl(_base: string, ours: string, theirs: string): MergeResult<string> {
  const oursLines = parseJsonl(ours);
  const theirsLines = parseJsonl(theirs);

  const seen = new Set<string>();
  const result: unknown[] = [];

  const addLine = (line: unknown): void => {
    const hash = hashValue(line);
    if (!seen.has(hash)) {
      seen.add(hash);
      result.push(line);
    }
  };

  for (const line of oursLines) addLine(line);
  for (const line of theirsLines) addLine(line);

  const merged = result.map((line) => JSON.stringify(line)).join('\n');
  return { success: true, merged };
}

/**
 * Parse JSONL string into array of parsed objects.
 */
function parseJsonl(data: string): unknown[] {
  return data
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => parseJsonLine(line));
}

/**
 * Parse single JSON line safely.
 */
function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return line;
  }
}
