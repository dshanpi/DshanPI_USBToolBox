/**
 * Formats error object to message string.
 *
 * Extracts message from various error types including
 * Error instances and objects with 'message' or 'error'
 * properties. Returns stringified value for unknown types.
 *
 * @param error - Error object or value to format
 * @returns Human-readable error message string
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
    if ('error' in error && typeof (error as { error: unknown }).error === 'string') {
      return (error as { error: string }).error;
    }
  }
  return String(error);
}