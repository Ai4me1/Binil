/**
 * Utility function to safely extract error messages from unknown error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error === null || error === undefined) {
    return 'Unknown error occurred';
  }
  return String(error);
}

/**
 * Utility function to safely extract error stack from unknown error types
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Create a standardized error object for logging
 */
export function createErrorLog(error: unknown, context?: string): {
  message: string;
  stack?: string;
  context?: string;
} {
  return {
    message: getErrorMessage(error),
    stack: getErrorStack(error),
    context
  };
}