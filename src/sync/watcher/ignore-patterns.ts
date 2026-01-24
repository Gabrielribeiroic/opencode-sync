/**
 * Ignore Patterns
 *
 * Patterns for files that should not trigger sync events.
 */

const IGNORE_PATTERNS = [
  /\.tmp$/,
  /\.bak$/,
  /~$/,
  /\.swp$/,
  /\.swo$/,
  /\.DS_Store$/,
  /Thumbs\.db$/,
  /\.git\//,
  /node_modules\//,
];

/**
 * Check if a file path should be ignored.
 */
export function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(filePath));
}
