import { EFEX_ERROR_CODES, EfexErrorData } from './Types';

/**
 * Map of error codes to error name strings.
 *
 * Used for generating human-readable error names in EfexError.
 */
const ERROR_NAMES: Record<number, string> = {
  [EFEX_ERROR_CODES.INVALID_PARAM]: 'InvalidParam',
  [EFEX_ERROR_CODES.NULL_PTR]: 'NullPtr',
  [EFEX_ERROR_CODES.MEMORY]: 'Memory',
  [EFEX_ERROR_CODES.NOT_SUPPORT]: 'NotSupported',
  [EFEX_ERROR_CODES.USB_INIT]: 'UsbInit',
  [EFEX_ERROR_CODES.USB_DEVICE_NOT_FOUND]: 'UsbDeviceNotFound',
  [EFEX_ERROR_CODES.USB_OPEN]: 'UsbOpen',
  [EFEX_ERROR_CODES.USB_TRANSFER]: 'UsbTransfer',
  [EFEX_ERROR_CODES.USB_TIMEOUT]: 'UsbTimeout',
  [EFEX_ERROR_CODES.PROTOCOL]: 'Protocol',
  [EFEX_ERROR_CODES.INVALID_RESPONSE]: 'InvalidResponse',
  [EFEX_ERROR_CODES.UNEXPECTED_STATUS]: 'UnexpectedStatus',
  [EFEX_ERROR_CODES.INVALID_STATE]: 'InvalidState',
  [EFEX_ERROR_CODES.INVALID_DEVICE_MODE]: 'InvalidDeviceMode',
  [EFEX_ERROR_CODES.OPERATION_FAILED]: 'OperationFailed',
  [EFEX_ERROR_CODES.DEVICE_BUSY]: 'DeviceBusy',
  [EFEX_ERROR_CODES.DEVICE_NOT_READY]: 'DeviceNotReady',
  [EFEX_ERROR_CODES.FLASH_ACCESS]: 'FlashAccess',
  [EFEX_ERROR_CODES.FLASH_SIZE_PROBE]: 'FlashSizeProbe',
  [EFEX_ERROR_CODES.FLASH_SET_ONOFF]: 'FlashSetOnOff',
  [EFEX_ERROR_CODES.VERIFICATION]: 'Verification',
  [EFEX_ERROR_CODES.CRC_MISMATCH]: 'CrcMismatch',
  [EFEX_ERROR_CODES.FILE_OPEN]: 'FileOpen',
  [EFEX_ERROR_CODES.FILE_READ]: 'FileRead',
  [EFEX_ERROR_CODES.FILE_WRITE]: 'FileWrite',
  [EFEX_ERROR_CODES.FILE_SIZE]: 'FileSize',
  [EFEX_ERROR_CODES.NO_FREE_SLOT]: 'NoFreeSlot',
  [EFEX_ERROR_CODES.INVALID_HANDLE]: 'InvalidHandle',
  [EFEX_ERROR_CODES.DEVICE_NOT_OPEN]: 'DeviceNotOpen',
  [EFEX_ERROR_CODES.TIMEOUT]: 'Timeout',
};

/**
 * Map of error codes to default error message strings.
 *
 * Used for generating human-readable error messages in EfexError.
 */
const ERROR_MESSAGES: Record<number, string> = {
  [EFEX_ERROR_CODES.INVALID_PARAM]: 'Invalid parameter',
  [EFEX_ERROR_CODES.NULL_PTR]: 'Null pointer error',
  [EFEX_ERROR_CODES.MEMORY]: 'Memory allocation error',
  [EFEX_ERROR_CODES.NOT_SUPPORT]: 'Operation not supported',
  [EFEX_ERROR_CODES.USB_INIT]: 'USB initialization failed',
  [EFEX_ERROR_CODES.USB_DEVICE_NOT_FOUND]: 'Device not found',
  [EFEX_ERROR_CODES.USB_OPEN]: 'Failed to open device',
  [EFEX_ERROR_CODES.USB_TRANSFER]: 'USB transfer failed',
  [EFEX_ERROR_CODES.USB_TIMEOUT]: 'USB transfer timeout',
  [EFEX_ERROR_CODES.PROTOCOL]: 'Protocol error',
  [EFEX_ERROR_CODES.INVALID_RESPONSE]: 'Invalid response from device',
  [EFEX_ERROR_CODES.UNEXPECTED_STATUS]: 'Unexpected status code',
  [EFEX_ERROR_CODES.INVALID_STATE]: 'Invalid device state',
  [EFEX_ERROR_CODES.INVALID_DEVICE_MODE]: 'Invalid device mode',
  [EFEX_ERROR_CODES.OPERATION_FAILED]: 'Operation failed',
  [EFEX_ERROR_CODES.DEVICE_BUSY]: 'Device is busy',
  [EFEX_ERROR_CODES.DEVICE_NOT_READY]: 'Device not ready',
  [EFEX_ERROR_CODES.FLASH_ACCESS]: 'Flash access error',
  [EFEX_ERROR_CODES.FLASH_SIZE_PROBE]: 'Flash size probing failed',
  [EFEX_ERROR_CODES.FLASH_SET_ONOFF]: 'Failed to set flash on/off',
  [EFEX_ERROR_CODES.VERIFICATION]: 'Verification failed',
  [EFEX_ERROR_CODES.CRC_MISMATCH]: 'CRC mismatch error',
  [EFEX_ERROR_CODES.FILE_OPEN]: 'Failed to open file',
  [EFEX_ERROR_CODES.FILE_READ]: 'Failed to read file',
  [EFEX_ERROR_CODES.FILE_WRITE]: 'Failed to write file',
  [EFEX_ERROR_CODES.FILE_SIZE]: 'File size error',
  [EFEX_ERROR_CODES.NO_FREE_SLOT]: 'No free device slot available',
  [EFEX_ERROR_CODES.INVALID_HANDLE]: 'Invalid device handle',
  [EFEX_ERROR_CODES.DEVICE_NOT_OPEN]: 'Device not opened',
  [EFEX_ERROR_CODES.TIMEOUT]: 'Operation timeout',
};

/**
 * Error class for EFEX device communication errors.
 *
 * EfexError wraps errors from the Rust backend libefex library,
 * providing error code classification and user-friendly messages.
 *
 * Error codes are organized into categories:
 * - USB errors: -10 to -14
 * - Protocol errors: -20 to -22
 * - State errors: -30 to -34
 * - Flash errors: -40 to -42
 * - Verification errors: -50 to -51
 * - File errors: -60 to -63
 *
 * Example usage:
 * ```typescript
 * try {
 *   await ctx.fel.write(addr, data);
 * } catch (e) {
 *   if (isEfexError(e) && e.isUsbError()) {
 *     console.log('USB communication failed');
 *   }
 * }
 * ```
 */
export class EfexError extends Error {
  /** Numeric error code from backend */
  public readonly code: number;

  /** Error name with EfexError prefix */
  public readonly name: string;

  /**
   * Creates an EfexError with code, name, and message.
   *
   * @param code - Error code number
   * @param name - Error name string
   * @param message - Error message string
   */
  constructor(code: number, name: string, message: string) {
    super(message);
    this.code = code;
    this.name = `EfexError[${name}]`;
    Object.setPrototypeOf(this, EfexError.prototype);
  }

  /**
   * Creates EfexError from EfexErrorData object.
   *
   * Used when receiving error data from backend IPC.
   *
   * @param data - Error data from backend
   * @returns EfexError instance
   */
  static fromData(data: EfexErrorData): EfexError {
    return new EfexError(data.code, data.name, data.message);
  }

  /**
   * Creates EfexError from error code with optional custom message.
   *
   * Uses default name and message from lookup tables if not provided.
   *
   * @param code - Error code number
   * @param customMessage - Optional custom message override
   * @returns EfexError instance
   */
  static fromCode(code: number, customMessage?: string): EfexError {
    const name = ERROR_NAMES[code] || 'Unknown';
    const message = customMessage || ERROR_MESSAGES[code] || `Unknown error code: ${code}`;
    return new EfexError(code, name, message);
  }

  /**
   * Checks if error is invalid parameter error.
   *
   * @returns True if invalid parameter error
   */
  isInvalidParam(): boolean {
    return this.code === EFEX_ERROR_CODES.INVALID_PARAM;
  }

  /**
   * Checks if error is device not found error.
   *
   * @returns True if device not found error
   */
  isDeviceNotFound(): boolean {
    return this.code === EFEX_ERROR_CODES.USB_DEVICE_NOT_FOUND;
  }

  /**
   * Checks if error is timeout error (USB or operation).
   *
   * @returns True if timeout error
   */
  isTimeout(): boolean {
    return this.code === EFEX_ERROR_CODES.USB_TIMEOUT || this.code === EFEX_ERROR_CODES.TIMEOUT;
  }

  /**
   * Checks if error is device busy error.
   *
   * @returns True if device busy error
   */
  isDeviceBusy(): boolean {
    return this.code === EFEX_ERROR_CODES.DEVICE_BUSY;
  }

  /**
   * Checks if error is device not ready error.
   *
   * @returns True if device not ready error
   */
  isDeviceNotReady(): boolean {
    return this.code === EFEX_ERROR_CODES.DEVICE_NOT_READY;
  }

  /**
   * Checks if error is a USB communication error.
   *
   * USB errors are codes -10 to -14.
   *
   * @returns True if USB error category
   */
  isUsbError(): boolean {
    return this.code >= -14 && this.code <= -10;
  }

  /**
   * Checks if error is a protocol error.
   *
   * Protocol errors are codes -20 to -22.
   *
   * @returns True if protocol error category
   */
  isProtocolError(): boolean {
    return this.code >= -22 && this.code <= -20;
  }

  /**
   * Checks if error is a flash access error.
   *
   * Flash errors are codes -40 to -42.
   *
   * @returns True if flash error category
   */
  isFlashError(): boolean {
    return this.code >= -42 && this.code <= -40;
  }

  /**
   * Checks if error is a file operation error.
   *
   * File errors are codes -60 to -63.
   *
   * @returns True if file error category
   */
  isFileError(): boolean {
    return this.code >= -63 && this.code <= -60;
  }

  /**
   * Checks if this is an actual error (not success code).
   *
   * @returns True if error code is not SUCCESS (0)
   */
  isError(): boolean {
    return this.code !== EFEX_ERROR_CODES.SUCCESS;
  }

  /**
   * Formats error as string for display.
   *
   * @returns Formatted error string
   */
  toString(): string {
    return `${this.name} (${this.code}): ${this.message}`;
  }

  /**
   * Converts error to JSON format for serialization.
   *
   * @returns EfexErrorData object
   */
  toJSON(): EfexErrorData {
    return {
      code: this.code,
      name: this.name.replace('EfexError[', '').replace(']', ''),
      message: this.message,
    };
  }
}

/**
 * Type guard for checking if value is an EfexError.
 *
 * @param error - Value to check
 * @returns True if value is EfexError instance
 */
export function isEfexError(error: unknown): error is EfexError {
  return error instanceof EfexError;
}

/**
 * Throws if result is EfexError, otherwise returns result.
 *
 * Utility for handling backend responses that may return either
 * a success value or an EfexError.
 *
 * @param result - Value to check
 * @returns Result value if not error
 * @throws EfexError if result is an error
 */
export function throwIfError<T>(result: T | EfexError): T {
  if (result instanceof EfexError) {
    throw result;
  }
  return result;
}