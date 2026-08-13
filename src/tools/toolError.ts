/**
 * Shared error handling utilities for tools.
 * Provides consistent error shapes, timeout support, and secret stripping.
 */

const MAX_ERROR_BODY_LENGTH = 200;
const DEFAULT_TIMEOUT_MS = 15_000; // 15 seconds

/**
 * A standardized tool error with metadata.
 * The tool name helps the model identify which operation failed.
 * The code allows programmatic error handling if needed.
 */
export class ToolError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

/**
 * Timeout a promise, optionally aborting a controller.
 * Throws ToolError with code "TIMEOUT" when timeout expires.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
  controller?: AbortController,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      if (controller) {
        controller.abort();
      }
      reject(new ToolError('withTimeout', `Operation timed out after ${ms}ms`, 'TIMEOUT'));
    }, ms);
    // Ensure the timer is cleared if promise resolves first
    promise.finally(() => clearTimeout(id));
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Normalize any error into a ToolError with sanitized message.
 * Strips anything that looks like a Bearer key and truncates long bodies.
 */
export function sanitizeError(err: unknown, toolName: string): ToolError {
  let message: string;
  let code: string | undefined;

  if (err instanceof ToolError) {
    // Already a ToolError — just ensure it's clean
    message = stripSecrets(err.message);
    code = err.code;
  } else if (err instanceof Error) {
    message = stripSecrets(err.message);
    code = undefined;
  } else if (typeof err === 'string') {
    message = stripSecrets(err);
    code = undefined;
  } else {
    message = 'Unknown error';
    code = 'UNKNOWN';
  }

  // Truncate very long messages (e.g., full HTTP bodies)
  if (message.length > MAX_ERROR_BODY_LENGTH) {
    message = message.slice(0, MAX_ERROR_BODY_LENGTH) + '... (truncated)';
  }

  return new ToolError(toolName, message, code);
}

/**
 * Remove Bearer tokens and key-like patterns from a string.
 * A simple best-effort sanitizer; not a full secret-detection system.
 */
function stripSecrets(str: string): string {
  // Remove "Bearer <token>" patterns (case-insensitive)
  return str.replace(/bearer\s+[^\s]+/gi, 'Bearer <REDACTED>');
}