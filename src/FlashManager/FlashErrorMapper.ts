import { EfexError } from '../Library/libEFEX';
import { formatErrorMessage } from '../Utils';
import { getErrorSolution } from './ErrorHandler';
import type { PopupType } from '../CoreUI';

/**
 * Represents a mapped flash error with optional popup information.
 *
 * Contains the normalized EfexError and optionally a popup
 * configuration for displaying the error to the user.
 */
export interface MappedFlashError {
  /** Normalized EfexError with code, name, and message */
  error: EfexError;
  /** Optional popup configuration for user display */
  popup?: {
    /** Popup type determining visual style */
    type: PopupType;
    /** Popup title */
    title: string;
    /** Popup message content */
    message: string;
  };
}

/**
 * Converts an unknown error to an EfexError.
 *
 * Handles EfexError instances, objects with numeric codes,
 * and generic unknown errors. Uses formatErrorMessage for
 * unknown error string conversion.
 *
 * @param error - Unknown error to convert
 * @returns Normalized EfexError instance
 */
function toEfexError(error: unknown): EfexError {
  if (error instanceof EfexError) return error;
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number'
  ) {
    const obj = error as { code: number; name?: string; message?: string };
    return EfexError.fromCode(obj.code, obj.message);
  }
  return EfexError.fromCode(-1, formatErrorMessage(error));
}

/**
 * Maps an unknown flash error to MappedFlashError.
 *
 * Converts the error to EfexError and retrieves any
 * available solution for displaying to the user.
 *
 * @param error - Unknown error from flash operation
 * @returns MappedFlashError with normalized error and optional popup
 */
export function mapFlashError(error: unknown): MappedFlashError {
  const mappedError = toEfexError(error);
  const solution = getErrorSolution(mappedError);
  return {
    error: mappedError,
    popup: solution
      ? {
          type: solution.type,
          title: solution.title,
          message: solution.message,
        }
      : undefined,
  };
}