/**
 * Merge Utilities
 *
 * Shared utilities for three-way merge operations.
 */

import { createHash } from 'node:crypto';

/**
 * Deep equality check for any two values.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    return compareObjects(a, b);
  }

  return false;
}

/**
 * Compare two objects for equality.
 */
function compareObjects(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    return compareArrays(a, b);
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}

/**
 * Compare two arrays for equality.
 */
function compareArrays(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => deepEqual(item, b[i]));
}

/**
 * Check if value is a plain object (not array, not null).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Hash a value for deduplication purposes.
 */
export function hashValue(value: unknown): string {
  const json = JSON.stringify(value);
  return createHash('md5').update(json).digest('hex');
}

/**
 * Get union of keys from multiple objects.
 */
export function getAllKeys(...objects: Record<string, unknown>[]): Set<string> {
  return new Set(objects.flatMap((obj) => Object.keys(obj)));
}
