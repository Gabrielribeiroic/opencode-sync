/**
 * Content Parsers
 *
 * Parse file content based on file type.
 */

/**
 * Parse file content based on extension.
 */
export function parseFileContent(filePath: string, content: string): unknown {
  if (filePath.endsWith('.json') || filePath.endsWith('.jsonc')) {
    return parseJsonContent(content);
  }
  if (filePath.endsWith('.jsonl')) {
    return parseJsonlContent(content);
  }
  return content;
}

/**
 * Parse JSON/JSONC content.
 */
function parseJsonContent(content: string): unknown {
  try {
    const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return JSON.parse(cleaned) as unknown;
  } catch {
    return content;
  }
}

/**
 * Parse JSONL content.
 */
function parseJsonlContent(content: string): unknown[] {
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => parseJsonLine(line));
}

/**
 * Parse a single JSONL line.
 */
function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return line;
  }
}
