/**
 * Logger Port - Interface for logging operations
 *
 * Defines the contract for logging without specifying implementation.
 * Adapters implement this interface for file, console, or API logging.
 */

/** Log levels in order of severity */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Log category tags for filtering */
export type LogCategory = 'SYNC' | 'REPO' | 'PLUGIN' | 'DEBUG' | 'WRITE';

/** Logger interface - the port that adapters implement */
export interface Logger {
  /** Log a message with optional category */
  log(message: string, category?: LogCategory): void;

  /** Log at debug level */
  debug(message: string, category?: LogCategory): void;

  /** Log at info level */
  info(message: string, category?: LogCategory): void;

  /** Log at warn level */
  warn(message: string, category?: LogCategory): void;

  /** Log at error level */
  error(message: string, category?: LogCategory): void;

  /** Start a timed operation, returns a function to call on completion */
  startOperation(name: string): (result?: string) => void;
}
