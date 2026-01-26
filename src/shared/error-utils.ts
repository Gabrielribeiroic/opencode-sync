/**
 * Error Utilities
 *
 * Shared functions for consistent error handling across the codebase.
 */

/**
 * Extract message from an unknown error value.
 * Handles Error objects, strings, and other types safely.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Extract stack trace from an unknown error value.
 * Returns undefined if the error is not an Error instance.
 */
export function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

/**
 * Convert an unknown error value to an Error object.
 * If already an Error, returns it directly.
 * Otherwise, creates a new Error with the string representation.
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(getErrorMessage(error));
}

/**
 * Check if a value is an Error instance.
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
