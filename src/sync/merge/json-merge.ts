/**
 * JSON Three-Way Merge
 *
 * Handles conflict resolution for JSON objects using three-way merge:
 * - Base: The common ancestor (last synced version)
 * - Ours: Current local version
 * - Theirs: Current remote version
 */

import { deepEqual, isPlainObject, getAllKeys, hashValue } from './utils.js';
import type { MergeResult, MergeConflict } from './types.js';

/**
 * Three-way merge for JSON objects.
 */
export function mergeJson(base: unknown, ours: unknown, theirs: unknown): MergeResult<unknown> {
  const conflicts: MergeConflict[] = [];
  const merged = mergeValue(base, ours, theirs, '', conflicts);

  const result: MergeResult<unknown> = {
    success: conflicts.length === 0,
    merged,
  };
  if (conflicts.length > 0) {
    result.conflicts = conflicts;
  }
  return result;
}

/**
 * Recursively merge values.
 */
function mergeValue(
  base: unknown,
  ours: unknown,
  theirs: unknown,
  path: string,
  conflicts: MergeConflict[]
): unknown {
  if (deepEqual(ours, theirs)) return ours;
  if (deepEqual(ours, base)) return theirs;
  if (deepEqual(theirs, base)) return ours;

  if (isPlainObject(ours) && isPlainObject(theirs) && isPlainObject(base)) {
    return mergeObjects(base, ours, theirs, path, conflicts);
  }

  if (Array.isArray(ours) && Array.isArray(theirs) && Array.isArray(base)) {
    return mergeArrays(ours, theirs);
  }

  conflicts.push({ path, base, ours, theirs });
  return ours;
}

// ─────────────────────────────────────────────────────────────────────────────
// Object Merge
// ─────────────────────────────────────────────────────────────────────────────

interface ObjectMergeContext {
  base: Record<string, unknown>;
  ours: Record<string, unknown>;
  theirs: Record<string, unknown>;
  path: string;
  conflicts: MergeConflict[];
}

interface KeyMergeResult {
  include: boolean;
  value?: unknown;
}

function mergeObjects(
  base: Record<string, unknown>,
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>,
  path: string,
  conflicts: MergeConflict[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const allKeys = getAllKeys(base, ours, theirs);
  const ctx: ObjectMergeContext = { base, ours, theirs, path, conflicts };

  for (const key of allKeys) {
    const merged = mergeObjectKey(key, ctx);
    if (merged.include) {
      result[key] = merged.value;
    }
  }

  return result;
}

function mergeObjectKey(key: string, ctx: ObjectMergeContext): KeyMergeResult {
  const keyPath = ctx.path ? `${ctx.path}.${key}` : key;
  const pattern = getPresencePattern(key, ctx);
  return resolveMergePattern(pattern, key, keyPath, ctx);
}

function getPresencePattern(key: string, ctx: ObjectMergeContext): string {
  const b = key in ctx.base ? 'B' : '_';
  const o = key in ctx.ours ? 'O' : '_';
  const t = key in ctx.theirs ? 'T' : '_';
  return `${b}${o}${t}`;
}

function resolveMergePattern(
  pattern: string,
  key: string,
  keyPath: string,
  ctx: ObjectMergeContext
): KeyMergeResult {
  switch (pattern) {
    case '___':
    case 'B__':
      return { include: false };
    case '_O_':
      return { include: true, value: ctx.ours[key] };
    case '__T':
      return { include: true, value: ctx.theirs[key] };
    case 'B_T':
      return handleOursDeleted(key, keyPath, ctx);
    case 'BO_':
      return handleTheirsDeleted(key, keyPath, ctx);
    default:
      return handleBothPresent(key, keyPath, ctx);
  }
}

function handleOursDeleted(key: string, keyPath: string, ctx: ObjectMergeContext): KeyMergeResult {
  const baseVal = ctx.base[key];
  const theirsVal = ctx.theirs[key];
  if (deepEqual(baseVal, theirsVal)) {
    return { include: false };
  }
  ctx.conflicts.push({ path: keyPath, base: baseVal, ours: undefined, theirs: theirsVal });
  return { include: false };
}

function handleTheirsDeleted(
  key: string,
  keyPath: string,
  ctx: ObjectMergeContext
): KeyMergeResult {
  const baseVal = ctx.base[key];
  const oursVal = ctx.ours[key];
  if (deepEqual(baseVal, oursVal)) {
    return { include: false };
  }
  ctx.conflicts.push({ path: keyPath, base: baseVal, ours: oursVal, theirs: undefined });
  return { include: true, value: oursVal };
}

function handleBothPresent(key: string, keyPath: string, ctx: ObjectMergeContext): KeyMergeResult {
  const merged = mergeValue(ctx.base[key], ctx.ours[key], ctx.theirs[key], keyPath, ctx.conflicts);
  return { include: true, value: merged };
}

// ─────────────────────────────────────────────────────────────────────────────
// Array Merge
// ─────────────────────────────────────────────────────────────────────────────

function mergeArrays(ours: unknown[], theirs: unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];

  const addItem = (item: unknown): void => {
    const hash = hashValue(item);
    if (!seen.has(hash)) {
      seen.add(hash);
      result.push(item);
    }
  };

  for (const item of ours) addItem(item);
  for (const item of theirs) addItem(item);

  return result;
}
